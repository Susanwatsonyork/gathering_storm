// Copyright (c) Susan Watson 2020-2022 All rights reserved
// This software is published under the GNU GENERAL PUBLIC LICENSE version 3.

const EventEmitter = require('events');
const moment = require('moment');
const StormReader = require('./stormreader');

class StormCategorizer extends EventEmitter {
    constructor() {
        super();
        this.corpus = [];
    } 

    onStormEvent(tweet) {
        this.lookForIdentifiers(tweet);
        this.emit('stormEvent', tweet);
    }
    
    lookForIdentifiers(tweet) {
        if (!Array.isArray(tweet.cat)) {
            tweet.cat = [];
        }

        const text = ' ' +tweet.text.toLowerCase().replace(/\W/g,' ') + ' ';

        this.corpus.forEach(v => {
            if (text.includes(v)) {
                // console.log(`MATCHED {${v}} in '${item.tweet.textLC}'`);
                tweet.cat.push(v.trim());
            }
        });

        return tweet.cat.length > 0;
    }


    async loadCorpus(corpusFileName = '') {
        try {

        if (corpusFileName == '') {
            throw new Error('The corpus file must be specified');
        }
        
        const reader = new StormReader();
        const subjects = await reader.readSubjectList(corpusFileName); 
    
        this.corpus = subjects.map((w) => {
            return ' ' + w.toLowerCase() + ' ';
        })


        } catch (ex) {
            console.log(`${ex}`);
            throw ex;
        }

    }
    
}

module.exports = StormCategorizer;
