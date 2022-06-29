// Copyright (c) Susan Watson 2020-2022 All rights reserved
// This software is published under the GNU GENERAL PUBLIC LICENSE version 3.

const fs = require('fs');
const readline = require('readline');
const EventEmitter = require('events');
const moment = require('moment');
const csv = require('fast-csv');
const StormUtil = require('./stormutil');

class StormReader extends EventEmitter {
    constructor() {
        super();
        this.stormUtil = new StormUtil();
        this.identifyDuplicates = false;
        this.subjects = [];
        this.clearSubjectStats();
        this.clearUniqueTweets();
    }

    addSubjects(value) {
        if (Array.isArray(value)) {
            value.forEach((u) => {
                this.subjects.push(u);
            })
        }
    }

    clearSubjectStats() {
        this.numRead = 0;
        this.numOutput = 0;
        this.subjectStats = new Map();
        this.subjects.forEach((s) => {
            this.subjectStats.set(s.id,0);
        });
    }

    addSubjectCount(id) {
        if (id > 0) {
            const value = this.subjectStats.get(id);
            this.subjectStats.set(id,value > 0 ? value +1 : 1); 
        }
    }

    calcStats() {
        this.rawStats = this.subjects.map((s) => {
            const c = this.subjectStats.get(s.id);
            const p = this.numRead > 0 ? Math.round((c / this.numRead) * 10000) / 100 : 0;
            return {
                id: s.id,
                screen_name: s.screen_name,
                name: s.name,
                count: c,
                perc: p
            }
        });

        this.sortedStats = this.rawStats.sort((a,b) => {
            let d = b.count - a.count;
            if (d === 0) {
                return a.screen_name.toLowerCase() < b.screen_name.toLowerCase() ? -1 : 1;
            }
            return d;
        });
    }

    outputStats() {
        this.calcStats();
        console.log(`Read: ${this.numRead}, Output: ${this.numOutput}`);

        this.sortedStats.forEach((s) => {
            if (s.count >= 0) {
                console.log(`${s.screen_name}, ${s.name}, ${s.count}, ${s.perc}%`);
            }
        });

        // console.log(process.memoryUsage());
    }

    outputConsoleStats() {
        console.log(`Read: ${this.numRead}, Output: ${this.numOutput}`);
    }


    static makeFilter(screenName, removeDuplicates = false, onlyDuplicates = false,
            categorizedOnly = false, author = '') {
        return {
            screenName,
            removeDuplicates,
            onlyDuplicates,
            categorizedOnly,
            author
        }
    }

    readSubjectList(filename) {
        return new Promise((resolve, reject) => 
        {
        const stream = fs.createReadStream(filename);
        const subjects = [];

        csv.fromStream(stream, {
             headers : false,
             ignoreEmpty:true,
             delimiter:'|',
             quote:null
        }).on("data", function(data){
             if (data.length >= 1) {
                 const subject = data[0].trim();
                 if (subject.length > 0)
                    subjects.push(subject);
            }
         }).on("end", function(){
            resolve(subjects);
         }).on("error", function(err){
            reject(new Error(err));
         });
        });
    }

    onPrettyPrintEvent(tweet) {
        let outputLine;
        try {
            const text = JSON.stringify(tweet.text);
            const cat = Array.isArray(tweet.cat) ? tweet.cat.join(',') : '';
            outputLine = `[${cat}] ${tweet.subject.sn} <= ${tweet.author.sn} (${tweet.type}) ${text}`;
        } catch (err) {
            outputLine = `ERROR: prettyLine: ${err}`;
        }
        console.log(outputLine);
    }

    //--------- Duplicates -----------------------------------
    clearUniqueTweets() {
        this.uniqueTweets = new Set();
    }

    isDuplicateTweet(tweet) {
        const baseMessage = this.stormUtil.extractBaseMessage(tweet.text);
        if (this.uniqueTweets.has(baseMessage)) {
            return true;
        }
        this.uniqueTweets.add(baseMessage);
        return false;
    }

    identifyDuplicate(tweet) {
        tweet.duplicate = this.isDuplicateTweet(tweet);
    }

    //------------- Filters ----------------------------
    checkDuplicateFilter(filter,tweet) {
        if (filter.onlyDuplicates) {
            return tweet.duplicate === true;
        } 

        if (filter.removeDuplicates) {
            return !this.isDuplicateTweet(tweet);
        }
        return true;
    }

    checkScreenFilter(filter,tweet) {
        if (typeof filter.screenName === 'string' && filter.screenName.length > 0) {
            if (typeof tweet.subject.sn !== 'string' || filter.screenName.toLowerCase() !== tweet.subject.sn.toLowerCase()) {
                return false;
            }
        }
        return true;
    }

    checkAuthorFilter(filter,tweet) {
        if (typeof filter.author === 'string' && filter.author.length > 0) {
            if (typeof tweet.author.sn !== 'string' || filter.author.toLowerCase() !== tweet.author.sn.toLowerCase()) {
                return false;
            }
        }
        return true;
    }


    categorizedOnlyFilter(filter,tweet) {
        if (filter.categorizedOnly === true) {
            if (!Array.isArray(tweet.cat) || tweet.cat.length === 0) {
                return false;
            }
        }
        return true;
    }
    

    checkFilter(filter,tweet) {
        return this.checkScreenFilter(filter,tweet) 
            && this.checkAuthorFilter(filter,tweet)
            && this.categorizedOnlyFilter(filter,tweet) 
            && this.checkDuplicateFilter(filter,tweet);
    }

    async readFile(filename,filter,outputStats = false) {
        return new Promise((resolve, reject) => 
        {
        try {
            this.clearUniqueTweets();
            this.clearSubjectStats();
            const rl = readline.createInterface({
              input: fs.createReadStream(filename),
              crlfDelay: Infinity
            });
        
            rl.on('line', (line) => {
              // Process the line.
                try {
                    if (typeof line === 'string' && line.length > 0) {
                        this.numRead++;
                        const tweet = JSON.parse(line);
                        if (this.checkFilter(filter,tweet)) {
                            if (this.identifyDuplicates) {
                                this.identifyDuplicate(tweet);
                            }
                            this.emit('stormEvent', tweet);
                            this.numOutput++;
                            this.addSubjectCount(tweet.subject.id);
                        }
                    }
                } catch (err) {
                    const outputLine = `ERROR: readLine: ${err}`;
                    console.log(outputLine);
                }
            });

            rl.on('close', () => {
                this.emit('stormClose');
                if (outputStats) {
                    this.outputStats();
                } else {
                    this.outputConsoleStats();
                }
                resolve();
              });
          } catch (err) {
              console.log(`file error reading: ${filename}`);
            reject(err);
          }
        });
    }

//    stormSearcher.on('stormEvent', stormWatcher.onStormEvent.bind(stormWatcher));

    async prettyPrint(filename,filter,outputStats) {
        this.on('stormEvent', this.onPrettyPrintEvent.bind(this));
        return this.readFile(filename,filter,outputStats);
    }


    async read(filename,filter,outputStats) {
        return this.readFile(filename,filter,outputStats);
    }

}

module.exports = StormReader;


