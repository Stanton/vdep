'use strict';

if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

const Fibery = require('fibery-unofficial');
const readline = require('linebyline');

class App {

  constructor () {
    this.logFile = './logs/DayZServer_X1_x64.ADM';
    this.payload = [];
    this.logDate;
    this.logPlayer;

    this.fibery = new Fibery({
      host: process.env.FIBERY_URL,
      token: process.env.FIBERY_TOKEN
    });
  }
  
  init () {
    let _self = this;

    console.log('VDEP Logfile Parser');

    _self.readFile(_self.logFile);
  }
  
  readFile (file) {
    let _self = this,
    rl = readline(file),
    logDate,
    latLongRegex = new RegExp(/^(.*), (.*),/),
    dateRegex = new RegExp(/^AdminLog started on ([0-9]{4}-[0-9]{2}-[0-9]{2}) at ([0-9]{2}:[0-9]{2}:[0-9]{2})$/),
    connectRegex = new RegExp(/^([0-9]{2}:[0-9]{2}:[0-9]{2})\s\W\sPlayer ['"](.*)['"] is connected \Wid=(.*)\W$/),
    disconnectRegex = new RegExp(/^([0-9]{2}:[0-9]{2}:[0-9]{2})\s\W\sPlayer ['"](.*)['"]\Wid=(.*)\W\shas\sbeen\sdisconnected$/),
    placeRegex = new RegExp(/^([0-9]{2}:[0-9]{2}:[0-9]{2}) \W Player ['"](.*)['"] \(id=(\S*) pos=<(.*)>\) placed ([\w\s]*)$/),
    murderRegex = new RegExp(/^([0-9]{2}:[0-9]{2}:[0-9]{2}) \W Player ['"](.*)['"] \(DEAD\) \(id=(\S*) pos=<(.*)>\) killed by Player ['"](.*)['"] \(id=(\S*) pos=<(.*)>\) with ([\w\D\s]*)( from [\w\D\s]+)?$/),
    deathRegex = new RegExp(/^([0-9]{2}:[0-9]{2}:[0-9]{2}) \W Player ['"](.*)['"] \(DEAD\) \(id=(\S*) pos=<(.*)>\)(\[HP: 0\])? (killed by|hit by Player|hit by) (.*)/),
    suicideRegex = new RegExp(/^([0-9]{2}:[0-9]{2}:[0-9]{2}) \W Player ['"](.*)['"] \(id=(\S*)( pos=<(.*)>)*\) committed suicide\w*/),
    buildRegex = new RegExp(/^([0-9]{2}:[0-9]{2}:[0-9]{2}) \W Player ['"](.*)['"] \(id=(\S*) pos=<(.*)>\)Built (.*) (on .*)/);
    
    console.log('reading ' + file);
    
    const parseLine = new Promise((resolve, reject) => {
      rl.on('line', function (line, lineCount, byteCount) {
        let logItem = new Object;

        console.log(line);

        // DayZ log entries don't have individual dates, so we need to keep track
        // of dates outside the loop and update the value as it increments
        if (line.includes('AdminLog started')) {
          let result = dateRegex.exec(line);
          
          _self.logDate = result[1];
        }

        else if (line.includes('is connected')) {
          let result = connectRegex.exec(line);

          logItem.Action = '✅  Connect';
          logItem.Time = result[1];
          logItem.Player = result[2];
          logItem['Player ID'] = result[3];
        }

        else if (line.includes('disconnected')) {
          let result = disconnectRegex.exec(line);
          
          logItem.Action = '❌  Disconnect';
          logItem.Time = result[1];
          logItem.Player = result[2];
          logItem['Player ID'] = result[3];
        }

        else if (line.includes('placed')) {
          let result = placeRegex.exec(line);
          
          logItem.Action = '🧱  Placed item';
          logItem.Time = result[1];
          logItem.Player = result[2];
          logItem['Player ID'] = result[3];
          logItem.Location = result[4];
          logItem.Item = result[5];
        }

        else if (line.includes('committed suicide')) {
          let result = suicideRegex.exec(line);
          
          logItem.Action = '😵  Committed suicide';
          logItem.Time = result[1];
          logItem.Player = result[2];
          logItem['Player ID'] = result[3];
          logItem.Location = result[4];
        }

        else if (line.includes('killed by Player')) {
          let result = murderRegex.exec(line);
          
          logItem.Action = '💀  Killed by Player';
          logItem.Time = result[1];
          logItem.Player = result[2];
          logItem['Player ID'] = result[3];
          logItem.Location = result[4];
          logItem.HitBy = result[5];
          logItem.HitSource = result[7];
          logItem.Item = result[8];
        }

        else if (line.includes('killed by')) {
          let result = deathRegex.exec(line);
          
          logItem.Action = '🪦  Died';
          logItem.Time = result[1];
          logItem.Player = result[2];
          logItem['Player ID'] = result[3];
          logItem.Location = result[4];
          logItem.Item = result[6] + ' ' + result[7];
        }

        else if (line.includes('Built')) {
          console.log(line);
          let result = buildRegex.exec(line);
          
          logItem.Action = '🛠  Built';
          logItem.Time = result[1];
          logItem.Player = result[2];
          logItem['Player ID'] = result[3];
          logItem.Location = result[4];
          logItem.Item = result[5];
          logItem.Detail = result[6];
        }
        else if (line.includes('died')) {
          return;
        }
        else {
          return;
        }

        // Split location string into separate latitude / longitude values, so we 
        // can write filters to target specific map areas
        if (logItem.Location) {
          let latLong = latLongRegex.exec(logItem.Location);
          logItem.Lat = latLong[1];
          logItem.Long = latLong[2];
        }

        // Use the complete line as the Fibery name, as this is likely to be the 
        // most unique value we have at our disposal
        logItem.Name = line;

        // Use the current date value we have stored as we parse through the file
        // and use it for this specific record
        logItem.Date = _self.logDate;

        // If we've encountered empty lines, or anything that hasn't hit our 
        // patterns, then don't bother sending that to Fibery
        if (_self.isObjectEmpty(logItem)) {
          return;
        }
        
        // Check if player record exists and deal with accordingly
        // _self.checkPlayer(logItem);

        // Create the log entry if it doesn't already exist
        if (logItem.Player) {
          console.log(logItem.Action);
          _self.checkEntry(logItem);
        }
        
      })
      .on('error', function(e) {
        console.log(e);
      })
      .on('end', function() {
        console.log('Finished.');
      });

    });

  }

  isObjectEmpty(obj) {
    return Object.keys(obj).length === 0;
  }

  checkEntry (logItem) {
    let _self = this;

    async function checkEntity() {
      const result = await _self.fibery.entity.query({
        'q/from': 'Log/Entry',
        'q/select': [
            'fibery/id',
            'fibery/public-id',
            'Log/Name'
        ],
        'q/where': ['=', ['Log/Name'], '$name' ],
        'q/limit': 1
      }, { '$name': logItem.Name });

      if (!result.length) {
        return logItem;
      }
      else {
        throw new Error('Exists');
      }
    }

    checkEntity().then(res => _self.createEntry(res)).catch(err => console.log(err));
  }

  createEntry (logItem) {
    let _self = this;

    async function createEntity() {
      const create = await _self.fibery.entity.createBatch([
        {
          'type': 'Log/Entry',
          'entity': {
            'Log/Name': logItem.Name,
            'Log/Action': logItem.Action,
            'Log/Date': logItem.Date,
            'Log/Detail': logItem.Detail,
            'Log/Item': logItem.Item,
            'Log/Lat': logItem.Lat,
            'Log/Long': logItem.Long,
            'Log/Location': logItem.Location,
            'Log/Player': logItem.Player,
            'Log/Player ID': logItem['Player ID']
          }
        }
      ]);
    }

    createEntity().then(res => console.log(res)).catch(err => console.log(err));

  }

  // createPlayer (payload) {
  //   let _self = this;

  //   createEntity();

  //   async function createEntity() {
  //     const log = await _self.fibery.entity.createBatch([
  //       {
  //         'type': 'Players/Player',
  //         'entity': {
  //           'Players/Name': payload.Player,
  //           'Players/ID': payload['Player ID'],
  //           'Players/First Seen': payload.Date,
  //           'Players/Last Seen': payload.Date
  //         }
  //       }
  //     ]);
  //   }
  // }

  // checkPlayer (logItem) {
  //   let _self = this;

  //   checkEntity();

  //   async function checkEntity() {
  //     const result = await _self.fibery.entity.query({
  //       'q/from': 'Players/Player',
  //       'q/select': [
  //           'fibery/id',
  //           'fibery/public-id',
  //           'Players/Name'
  //       ],
  //       'q/where': ['=', ['Players/Name'], '$name' ],
  //       'q/limit': 1
  //     }, { '$name': logItem.Player });

  //     if (!result.length) {
  //       console.log('create ' + logItem.Player)
  //       // _self.createPlayer(logItem);
        
  //     } else {
  //       console.log('SKIP ' + logItem.Player)
  //     }
  //   }
  // }

}

module.exports = App;