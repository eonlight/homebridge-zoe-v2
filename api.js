const axios = require('axios')

let kamareonURL = "https://api-wired-prod-1-euw1.wrd-aws.com"
let kamareonAPI = "VAX7XYKGfa92yMvXculCkEFyfZbuM7Ss"
let gigyaURL = "https://accounts.eu1.gigya.com"
let gigyaAPI = "3_7PLksOyBRkHv126x5WhHb-5pqC1qFR8pQjxSeLB6nhAnPERTUlwnYoznHSxwX668"

function APIWrapper(username, password, vin, log, storage) {
    this.username = username;
    this.password = password;
    this.vin = vin;
    this.log = log;
    this.storage = storage;

    this.accountId = this.storage.getItemSync("accountId");
    this.gigyaJWTToken = this.storage.getItemSync("gigyaJWTToken");
    this.gigyaCookieValue = this.storage.getItemSync("gigyaCookieValue");
    this.gigyaPersonID = this.storage.getItemSync("gigyaPersonID");
    this.lastJWTCall = this.storage.getItemSync("lastJWTCall");

    this.log("New API Wrapper created.");
}

APIWrapper.prototype.login = function () {
    return new Promise(async (resolve, reject) => {

        // get tiemstamp now
        now = new Date().toJSON().slice(0,13).replace(/-/g,'').replace(/T/g,'-');
        if(this.lastJWTCall !== undefined && this.lastJWTCall != "" && this.lastJWTCall != now){
            this.clear();
        }

        try {
            if(this.gigyaCookieValue == "" || this.gigyaPersonID == "" || this.gigyaCookieValue === undefined || this.gigyaPersonID === undefined) {
                this.log("1. Logging in");

                // TODO: might need to url encode username and password
                let url = gigyaURL + '/accounts.login?loginID=' + this.username + '&password=' + this.password + '&include=data&apiKey=' + gigyaAPI;
                let apiResult = await axios.get(url);
                apiResult = apiResult.data;

                if(apiResult.statusCode == "403"){
                    this.log("Login failed: " + JSON.stringify(apiResult));
                    reject(apiResult);
                } else {
                    this.gigyaCookieValue = apiResult.sessionInfo.cookieValue;
                    this.gigyaPersonID = apiResult.data.personId;

                    // save to permanent storage
                    this.storage.setItemSync("gigyaCookieValue", this.gigyaCookieValue);
                    this.storage.setItemSync("gigyaPersonID", this.gigyaPersonID);
                }
            }

            if(this.gigyaJWTToken == "" || this.gigyaJWTToken == undefined){
                this.log("2. Obtaining Gigya Token");
                let expiration = 87000;
                url = gigyaURL + '/accounts.getJWT?oauth_token=' + this.gigyaCookieValue + '&login_token=' + this.gigyaCookieValue + '&expiration=' + expiration + '&fields=data.personId,data.gigyaDataCenter&ApiKey=' + gigyaAPI;

                this.log("Token URL: " + url);

                let apiResult = await axios.get(url);
                apiResult = apiResult.data;

                //this.log("Gigya Token Result: " + JSON.stringify(apiResult));

                if(apiResult.statusCode == 200) {
                    this.gigyaJWTToken = apiResult.id_token;
                    this.lastJWTCall = new Date().toJSON().slice(0,13).replace(/-/g,'').replace(/T/g,'-');

                    this.storage.setItemSync("gigyaJWTToken", this.gigyaJWTToken);
                    this.storage.setItemSync("lastJWTCall", this.lastJWTCall);
                } else {
                    this.log("Failed to get Gigya token: " + JSON.stringify(apiResult));
                    reject(apiResult.errorMessage);
                }
            }


            if(this.accountId == "" || typeof(this.accountId) == "undefined"){
                this.log("3. Obtaining Account ID");
                url = kamareonURL + '/commerce/v1/persons/' + this.gigyaPersonID + '?country=DE';
                let getConfig = {headers: {"x-gigya-id_token": this.gigyaJWTToken, "apikey": kamareonAPI}};
                let apiResult = await axios.get(url, getConfig);
                apiResult = apiResult.data;

                //this.log("Account ID Result: " + JSON.stringify(apiResult));

                if(apiResult.type == "FUNCTIONAL"){
                    this.log("Couldn't get account ID");
                    reject(apiResult.messages[0].message);
                } else {
                    this.accountId = apiResult.accounts[0].accountId;
                    this.storage.setItemSync("accountId", this.accountId);
                }
            }

            resolve("login successful");

        } catch(e){
            reject(e)
        }
    })
}

APIWrapper.prototype.clear = function () {
    return new Promise(async (resolve, reject) => {
        this.log("Clearing tokens");
        this.accountId = "";
        this.gigyaJWTToken = "";
        this.gigyaCookieValue = "";
        this.gigyaPersonID = "";
        this.lastJWTCall == "";

        this.storage.setItemSync("accountId", this.accountId);
        this.storage.setItemSync("gigyaJWTToken", this.gigyaJWTToken);
        this.storage.setItemSync("gigyaCookieValue", this.gigyaCookieValue);
        this.storage.setItemSync("gigyaPersonID", this.gigyaPersonID);
        this.storage.setItemSync("lastJWTCall", this.lastJWTCall);

        resolve("tokens cleared");
    })
}


APIWrapper.prototype.getBatteryStatus = function () {
  return new Promise(async (resolve, reject) => {
    try {
      let batteryStatus = await this.getStatus('battery-status', 2);
      resolve(batteryStatus);
    } catch (e) {
      reject(e);
    }
  })
}

/*
APIWrapper.prototype.startCharging = function (vin) {
  return new Promise(async (resolve, reject) => {
    try {
      let attr_data = '{"data":{"type":"ChargingStart","attributes":{"action":"start"}}}';
      let action = await this.setStatus('charging-start', 1, attr_data.toString());
      this.log("Start Charge Result: " + JSON.stringify(action));
      resolve(action);
    } catch (e) {
      reject(e);
    }
  })
}


APIWrapper.prototype.stopCharging = function (vin) {
  return new Promise(async (resolve, reject) => {
    try {
      let attr_data = '{"data":{"type":"ChargingStart","attributes":{"action":"stop"}}}';
      let action = await this.setStatus('charging-start', 1, attr_data.toString());
      this.log("Stop Charge Result: " + JSON.stringify(action));
      resolve(action);
    } catch (e) {
      reject(e);
    }
  })
}*/

APIWrapper.prototype.getStatus = async function (endpoint, version=1) {
    // fetch data from kamereon (single vehicle)
    url = kamareonURL + '/commerce/v1/accounts/' + this.accountId + '/kamereon/kca/car-adapter/v' + version + '/cars/' + this.vin + '/' + endpoint + '?country=DE';

    //this.log("Get Status URL: " + url);

    let getConfig = {headers: {"x-gigya-id_token": this.gigyaJWTToken, "apikey": kamareonAPI, "Content-type": "application/vnd.api+json"}};
    let apiResult = await axios.get(url, getConfig);

    //this.log("Status: " + JSON.stringify(apiResult.data));

    if (apiResult.status != 200) {
        this.log("Error getting status: " + JSON.stringify(apiResult.data));
    }

    return apiResult.data
}

APIWrapper.prototype.setStatus = async function (endpoint, version=1, data){
    url = kamareonURL + '/commerce/v1/accounts/' + this.accountId + '/kamereon/kca/car-adapter/v' + version + '/cars/' + this.vin + '/actions/' + endpoint + '?country=DE'

    //this.log("Set Status URL: " + url);

    let postConfig = {headers: {"x-gigya-id_token": this.gigyaJWTToken, "apikey": kamareonAPI, "Content-type": "application/vnd.api+json"}};
    apiResult = await axios.post(url, data, postConfig);

    //this.log("Status: " + JSON.stringify(apiResult.data));

    if (apiResult.status != 200) {
        this.log("Error setting status: " + JSON.stringify(apiResult.data));
    }

    return apiResult.data;
}

module.exports = APIWrapper