"use strict";
const rp = require("request-promise"),
    fs = require("fs"),
    xml2js = require("xml2js"),
    validUrl = require("valid-url");

let magnet = {},
    xmlFile = process.argv[2].toString(),
    saveLoc = process.argv[3].toString(),
    transmissionURI = process.argv[4].toString();

let getTorrentInfo = {
    "arguments": {
        "fields": [
            "id",
            "name",
            "totalSize"
        ],
        "ids": [
            1
        ]
    },
    "method": "torrent-get",
    "tag": 39693
};

let addTorrent = {
    "arguments": {
        "download-dir": "",
        "paused": "true",
        "filename": "filename"
    },
    "method": "torrent-add",
    "tag": 39693
};

let sessionIDParser = {
    "method": "session-get",
    "tag": 12345
};

let options = {
    simple: false,
    resolveWithFullResponse: true,
    headers: {
        "x-transmission-session-id": "id"
    },
    uri: "",
    method: "POST",
    json: true,
    set setbody(parser) {
        this.body = parser;
    },
    set setid(id){
        this.headers["x-transmission-session-id"] = id;
    }
};

function run(taskDef) {

    // create the iterator
    let task = taskDef();

    // start the task
    let result = task.next();

    // recursive function to iterate through
    (function step() {

        // if there's more to do
        if (!result.done) {

            // resolve to a promise to make it easy
            let promise = Promise.resolve(result.value);
            promise.then(function(value) {
                result = task.next(value);
                step();
            }).catch(function(error) {
                result = task.throw(error);
                step();
            });
        }
    }());
}

function readFile(filename) {
    return new Promise(function(resolve, reject) {
        fs.readFile(filename, function(err, contents) {
            if (err) {
                reject(err);
            } else {
                resolve(contents);
            }
        });
    });
}

function processXML(data) {
    return new Promise(function(resolve, reject) {
        xml2js.parseString(data, function(err, result) {
            if (err) {
                reject(err);
            } else {
                resolve(result);
            }
        });
    });
}

function getSessionID() {
    options.setbody = sessionIDParser;
    return rp(options)
        .then(function (body) {
            if (body.statusCode === 409) {
                return body.headers["x-transmission-session-id"];
            }
        })
        .catch(function (err) {
            console.log(err);
        });
}

function postRequest(args, sessionID) {
    options.setid = sessionID;
    options.setbody = args;
    return rp(options)
        .then(function (body) {
            console.log(body.body);
        })
        .catch(function (err) {
            console.log(err);
        });
}

function* entries(obj) {
    for (let key of Object.keys(obj)) {
        yield [key, obj[key]];
    }
}

function checkArgs() {
    if (process.argv.length !== 5) {
        throw new Error("Too many arguments.");
    } else if (validUrl.isUri(transmissionURI)) {
        return true;
    } else {
        throw new Error("Invalid URI.");
    }
}


if (checkArgs()) {
    run(function*() {
        options["uri"] = transmissionURI;
        let xmlData = yield readFile(xmlFile);
        let jsonData = yield processXML(xmlData);
        let parsed = jsonData.rss.channel[0].item;
        for (let v of parsed) {
            magnet[v.title] = v.enclosure[0].$.url;
        }
        let sessionID = yield getSessionID();
        addTorrent["arguments"]["download-dir"] = saveLoc;
        // iterate through magnet and post request
        for (let [_key, value] of entries(magnet)) {
            addTorrent["arguments"]["filename"] = decodeURIComponent(decodeURIComponent(value));
            yield postRequest(addTorrent, sessionID);
        }
    });
}
