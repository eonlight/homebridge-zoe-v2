"use strict";

var APIWrapper = require("./api")

var Service, Characteristic, HomebridgeAPI;

module.exports = function(homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    HomebridgeAPI = homebridge;
    homebridge.registerAccessory("homebridge-zoe-v2", "RenaultZoe", RenaultZoe);
}

function RenaultZoe(log, config) {
    this.log = log;
    this.name = config.name;

    // car type details
    this.phaseType = config.phase;
    this.batteryType = config.battery;
    this.vin = config.vin;

    // login details
    this.username = config.username;
    this.password = config.password;

    //this.log("Accessory: " + JSON.stringify(this))

    // set storage settings
    this.cacheDirectory = HomebridgeAPI.user.persistPath();
    this.storage = require('node-persist');
    this.storage.initSync({dir:this.cacheDirectory, forgiveParseErrors: true});


    this.api = new APIWrapper(this.username, this.password, this.vin, log, this.storage);
    this.api.login().then(result => {
        this.log("Login result: " + result);
    }).catch(e => {
        this.log("Login error: " + e);
    });

    // information about the car
    this.informationService = new Service.AccessoryInformation();
    this.informationService
        .setCharacteristic(Characteristic.Manufacturer, 'Renault')
        .setCharacteristic(Characteristic.Model, 'Zoe')
        .setCharacteristic(Characteristic.SerialNumber, this.vin);

    // returns info about the battery
    this.battery = new Service.Battery(this.name + ' Battery');
    this.battery.getCharacteristic(Characteristic.StatusLowBattery)
        .onGet(this.handleLowBattery.bind(this));
    this.battery.getCharacteristic(Characteristic.ChargingState)
        .onGet(this.handleGetChargingState.bind(this));
    this.battery.getCharacteristic(Characteristic.BatteryLevel)
        .onGet(this.handleGetBatteryLevel.bind(this));

    // starts and stops battery charging
    this.charge = new Service.Switch(this.name + ' Charge');
    this.charge.getCharacteristic(Characteristic.On)
        .onGet(this.handleGetChargingState.bind(this))
        .onSet(this.handleChargeSet.bind(this));

    // this._hvacService

    this.log("New Reanult Zoe accessory created.")
}

RenaultZoe.prototype.getServices = function() {
    return [this.informationService, this.battery, this.charge];
}

RenaultZoe.prototype.handleChargeSet = function(value) {
    this.log("Charge set: " + value);

    if(value)
        this.api.startCharging();
    else
        this.api.stopCharging();
}

RenaultZoe.prototype.handleGetChargingState = async function() {
    this.log("Battery Charging State Handle Called");

    let status = await this.api.getBatteryStatus('battery-status', 2)
    return status.chargingStatus == 0 ? Characteristic.ChargingState.NOT_CHARGING : Characteristic.ChargingState.CHARGING;
}

RenaultZoe.prototype.handleGetBatteryLevel = async function() {
    this.log("Battery Level Handle Called");
    let status = await this.api.getBatteryStatus('battery-status', 2)
    //this.log("Bat Level Status: " + JSON.stringify(status));
    return status.batteryLevel;

    /*{
        "id":"VF1AG000XXXXXXXXX",
        "timestamp":"2022-03-28T12:32:43Z",
        "batteryLevel":62,
        "batteryTemperature":20,
        "batteryAutonomy":204,
        "batteryCapacity":0,
        "batteryAvailableEnergy":30,
        "plugStatus":0,
        "chargingStatus":0,
        "chargingRemainingTime":780,
        "chargingInstantaneousPower":19.6
    }*/
}

// TODO: not sure what this one does?
RenaultZoe.prototype.handleLowBattery = function() {
    this.log("Low Battery Handle Called");
    return Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL;
}