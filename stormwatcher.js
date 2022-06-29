// Copyright (c) Susan Watson 2020-2022 All rights reserved
// This software is published under the GNU GENERAL PUBLIC LICENSE version 3.

const fs = require('fs');
const moment = require('moment');
const crypto = require('crypto');

class StormWatcher {
    constructor() {
        this.baseOutput = 'tweet';
        this.outputFormat = 'json';
        this.numOutput = 0;
        this.addDateToFilename = false;
        this.addSubjectToFilename = false;
    }

    setOutputFormat(value) {
        if (typeof value === 'string' && value.length > 0) {
            this.outputFormat = value;
        }
    }

    setOutput(output) {
        this.baseOutput = output;
    }

    setAddDateToFilename(value) {
        this.addDateToFilename = value;
    }

    setAddSubjectToFilename(value) {
        this.addSubjectToFilename = value;
    }


    outputFileName(item) {
        if (this.addDateToFilename) {
            const m = moment().format('YYYYMMDD');
            return `${this.baseOutput}_${m}.txt`;
        } else if (this.addSubjectToFilename) {
            const s = (item && 'subject' in item && 'sn' in item.subject && typeof item.subject.sn === 'string' && item.subject.sn.length >= 1) 
                ? item.subject.sn.toLowerCase() : 'unknown';
            return `${this.baseOutput}_${s}.txt`;
        }
        return this.baseOutput;
    }

    hashName(sn) {
        const hash = crypto.createHash('sha256');

        hash.update('saltystuff' + sn);
        const h = hash.digest('base64');

        return h.substring(0,6);
    }

    itemToText(item) {
        let outputLine;
        try {
            const timeStamp = moment(item.timeStamp);
            const tweetTime = timeStamp.format('DD/MM/YY HH:mm:ss');
            const text = JSON.stringify(item.text);

            let cat = Array.isArray(item.cat) ? item.cat.join(',') : '';

            const isdup = ('duplicate' in item) && item.duplicate;
            const authorIsSubject = item.subject.sn == item.author.sn;

            let typeInfo = item.type;
            if (isdup) {
                if (typeInfo != '') {
                    typeInfo += ', ';
                }
                typeInfo += 'duplicate';
            }


            if (authorIsSubject) {
                if (typeInfo != '') {
                    typeInfo += ', ';
                }
                typeInfo += 'authorIsSubject';
            }

            const author = this.hashName(item.author.sn);

            outputLine = `${tweetTime} [${cat}] ${author} (${typeInfo}) ${text}`;
        } catch (err) {
            outputLine = `ERROR: prettyLine: ${err}`;
        }
        return outputLine;
    }

    itemToString(item) {
        switch (this.outputFormat) {
            case 'text':
                return this.itemToText(item);

            default:
                return JSON.stringify(item);
        }
    }

    outputItem(item) {
        this.numOutput++;
        const outputStr = this.itemToString(item);

        fs.appendFileSync(this.outputFileName(item), outputStr + "\n");

        if (this.numOutput % 10000 == 0) {
            console.log(`Tweets output: ${this.numOutput}`);
        }
    }

    onStormEvent(item) {
        this.outputItem(item);
    }
    
}

module.exports = StormWatcher;
