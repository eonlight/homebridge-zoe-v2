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
    //this.phaseType = config.phase;
    //this.batteryType = config.battery;
    this.lowBatteryLevel = config.lowBattery || 30;
    this.updateInterval = config.interval || 1800; // in seconds
    this.vin = config.vin;

    // login details
    this.username = config.username;
    this.password = config.password;

    // set storage settings
    this.cacheDirectory = HomebridgeAPI.user.persistPath();
    this.storage = require('node-persist');
    this.storage.initSync({dir:this.cacheDirectory, forgiveParseErrors: true});

    this.batteryStatus = this.storage.getItemSync("batteryStatus");

    this.api = new APIWrapper(this.username, this.password, this.vin, log, this.storage);
    this.api.login().then(result => {
        this.log("Login result: " + result);
        this.startInterval();
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
    // stop charge doesn't work

    /*
    this.charge = new Service.Switch(this.name + ' Charge');
    this.charge.getCharacteristic(Characteristic.On)
        .onGet(this.handleGetChargingState.bind(this))
        .onSet(this.handleChargeSet.bind(this));
    */


    // TODO: this.hvacService

    this.log("New Reanult Zoe accessory created.")
}

RenaultZoe.prototype.getServices = function() {
    return [this.informationService, this.battery, this.charge];
}

RenaultZoe.prototype.startInterval = function() {
    this.log("Starting timeout");
    this.interval = setInterval(() => {
        this.log("Timeout called");
        this.api.login().then(res => {
            this.updateBattery();
        }).catch(e => {
            reject(e);
        })
    }, this.updateInterval * 1000);
}

RenaultZoe.prototype.updateBattery = async function() {
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
    this.batteryStatus = await this.api.getBatteryStatus();
    this.storage.setItemSync("batteryStatus", this.batteryStatus);
}

RenaultZoe.prototype.handleChargeSet = function(value) {
    // clear state
    this.batteryStatus = undefined;

    if(value)
        this.api.startCharging().then(status => {
            this.updateBattery();
        });
    else
        this.api.stopCharging().then(status => {
            this.updateBattery();
        });
}

RenaultZoe.prototype.handleGetChargingState = async function() {
    if(this.batteryStatus === undefined || this.batteryStatus == "")
        await this.updateBattery()

    return this.batteryStatus.chargingStatus == 0 ? Characteristic.ChargingState.NOT_CHARGING : Characteristic.ChargingState.CHARGING;
}

RenaultZoe.prototype.handleGetBatteryLevel = async function() {
    if(this.batteryStatus === undefined || this.batteryStatus == "")
        await this.updateBattery()

    return this.batteryStatus.batteryLevel;
}

RenaultZoe.prototype.handleLowBattery = async function() {
    if(this.batteryStatus === undefined || this.batteryStatus == "")
        await this.updateBattery()

    return this.batteryStatus.batteryLevel < this.lowBatteryLevel ? Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW : Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL;
}