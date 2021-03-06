const miio = require('miio');
const mqtt = require('mqtt');
const pidfile = require('easy-pid-file')('/var/run/air_purifier.pid');

var myStatus = {};
var client  = mqtt.connect('mqtt://192.168.1.122');
var purifier;

console.log("pidfile", pidfile.getState());

client.on('connect', function () {
  console.log('MQTT connected');
  client.subscribe('airpurifier/in', function (err) {
    if (err) {
        console.log('mqtt err', err);
    }
  })
});
client.on('message', function (topic, message) {
  // message is Buffer
  if (purifier) {
    let json = JSON.parse(message.toString());
    if ('Active' in json) {
      let power = (json.Active>0)?true:false;
      purifier
        .power(power)
        .then (() => {
          let Active = {"Active" : (power)?1:0, "CurrentAirPurifierState" : (power)?2:0};
          client.publish('airpurifier/out', JSON.stringify(Active));
        });

    } else if ('TargetAirPurifierState' in json) {
        let mode = (json.TargetAirPurifierState==1)?'auto':'favorite';
        purifier.changeMode(mode);
    } else if ('LockPhysicalControls' in json) {
        purifier.changeChildLock (!json.LockPhysicalControls);
    } else if ("RotationSpeed" in json){
        purifier.changeFavoriteLevel(json.RotationSpeed);
    }
    console.log(topic, ">>>", json);
  }
})



miio
  .device({ address: '192.168.1.160', token: 'ffb97deea1c7464544b931ddcce657e6' })
  .then(device => {
      console.log('Connected to', device);
      purifier = device;
      getStatus(device);
      setInterval(()=>getStatus(device), 300000);

      device.on('powerChanged', power => {
        let Active = {"Active" : (power)?1:0, "CurrentAirPurifierState" : (power)?2:0};
        client.publish('airpurifier/out', JSON.stringify(Active));
        console.log('Power:', power);
      });
      device.on('modeChanged', mode => {
        client.publish('airpurifier/out', JSON.stringify({"TargetAirPurifierState": (mode==0)?1:0}));
        console.log('Mode:', mode );
      })
      device.on('pm2.5Changed', pm2_5 => {
            let Quality = {"AirQuality":airQuality(pm2_5), "PM2_5Density":pm2_5};
            client.publish('airpurifier/out', JSON.stringify(Quality));
            console.log('PM2_5:', Quality);
      });
      device.on('relativeHumidityChanged', rh => {
            client.publish('airpurifier/out', JSON.stringify({"CurrentRelativeHumidity" : Math.round(rh)}));
            console.log('Humidity:', rh);
      });
      device.on('temperatureChanged', temp  => {
        client.publish('airpurifier/out', JSON.stringify({"CurrentTemperature" : Math.round(temp.celsius)}));
        console.log('Temperature:', temp.celsius );
      });
    })
  .catch(err => {console.log('Error2', err)});




function airQuality (pm2_5) {
  let pm2_5Q = 0;
  if (pm2_5 < 10) {pm2_5Q = 1;}
  else if (pm2_5 < 20) {pm2_5Q = 2;} 
  else if (pm2_5 < 25) {pm2_5Q = 3;}
  else if (pm2_5 < 50) {pm2_5Q = 4;}
  else {pm2_5Q = 5;}
  return pm2_5Q;
}

const map = (value, x1, y1, x2, y2) => Math.round((value - x1) * (y2 - x2) / (y1 - x1) + x2);

function getStatus(device) {
      device
      .loadProperties(['mode','filter1_life','aqi', 'child_lock','power','temperature','humidity','fan','buzzer','led_brightness','motor_speed', 'favorite_level'])
      .then(status => {
          let pm2_5 = status.aqi.value
          let currSpeed = map(status.motor_speed.value, 350, 2200, 1, 14);

          myStatus.FilterLifeLevel = status.filter1_life.value;
          myStatus.FilterChangeIndication = (myStatus.FilterLifeLevel>5)?0:1;

          myStatus.AirQuality = airQuality(pm2_5);
          myStatus.PM2_5Density = pm2_5;

          myStatus.LockPhysicalControls = status.child_lock.value;

          myStatus.CurrentTemperature = Math.round(status.temperature.value);  ////!!!!Math.round
          myStatus.CurrentRelativeHumidity = Math.round(status.humidity.value); ////!!!!Math.round
          
          myStatus.Active = (status.power.value)?1:0;
          myStatus.TargetAirPurifierState = (status.mode.value==0)?1:0
          myStatus.CurrentAirPurifierState = (status.motor_speed.value>0 && status.power.value)?2:0;
          myStatus.RotationSpeed = (status.mode.value==0) ? currSpeed : status.favorite_level.value;

          //myStatus.mode = status.mode.value;
          //myStatus.fan = status.fan.value;
          myStatus.motor_speed = status.motor_speed.value;
          //myStatus.favorite_level = status.favorite_level.value;
          myStatus.buzzer = status.buzzer.value;
          myStatus.led_brightness = status.led_brightness.value;


          client.publish('airpurifier', JSON.stringify(myStatus));
//          console.log('motor_speed:', status.favorite_level.value, currSpeed, status.motor_speed.value);
          //console.log('Status:', myStatus);
      })
      .catch(err => {console.log('Error Device' , err)});
}


