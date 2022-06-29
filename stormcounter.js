// Copyright (c) Susan Watson 2020-2022 All rights reserved
// This software is published under the GNU GENERAL PUBLIC LICENSE version 3.

const fs = require('fs');
const moment = require('moment');
const stats = require('simple-statistics');
const StormUtil = require('./stormutil');

const DUPLICATE_OUTPUT_LIMIT = 200;
const twitterDateFormat = 'ddd MMM DD HH:mm:ss ZZ YYYY';

class StormCounter {
    constructor() {
        this.stormUtil = new StormUtil();
        this.baseOutput = 'tweettime';
        this.numOutput = 0;
        this.tweetsByHour = new Map();
        this.tweetsByDay = new Map();
        this.timeStart = moment('20200101T000000');
        this.subjects = new Map();
        this.closeReadOccured = false;
        this.clearDuplicateTweets();
        this.statsByHour = false;
    }

    // config
    addSubjects(value) {
        if (Array.isArray(value)) {
            value.forEach((u) => {
                this.subjects.set(u.screen_name.toLocaleLowerCase(),u);
            })
        }
    }

    setStatsByHour(value) {
        this.statsByHour = value;
    }

    setOutput(output) {
        this.baseOutput = output;
    }

    outputFileName() {
        return this.baseOutput;
    }


    //--------- Duplicates -----------------------------------
    clearDuplicateTweets() {
        this.duplicateTweetCounts = new Map();
        this.duplicatedTweets = [];
    }

    addTweetToDuplicateCounts(text) {
        const baseMessage = this.stormUtil.extractBaseMessage(text);
        let currentCount = this.duplicateTweetCounts.get(baseMessage);
        currentCount = (typeof currentCount === 'undefined') ? 1 : currentCount + 1;
        this.duplicateTweetCounts.set(baseMessage,currentCount);
    }

    addDuplicatedTweet(item) {
        const baseMessage = this.stormUtil.extractBaseMessage(item.text);
        let currentCount = this.duplicateTweetCounts.get(baseMessage);
        if (currentCount > 1) {
            item.duplicationCount = currentCount;
            this.duplicatedTweets.push(item);
            // we only want the original
            this.duplicateTweetCounts.delete(baseMessage);
        }
    }

    sortDuplicate() {
        this.duplicatedTweetsSorted = this.duplicatedTweets.sort((a, b) => Number.parseInt(b.duplicationCount) - Number.parseInt(a.duplicationCount));
    }


    //-------- process ---------------------------------------
    addPoint(map, point, title,values) {
        let counts = {
            count: 1,
            unclassified: values.unclassified ? 1 : 0,
            unclassifiedDuplicate:  values.unclassifiedDuplicate ? 1 : 0,
            classified: values.classified ? 1 : 0,
            classifiedDuplicate: values.classifiedDuplicate ? 1 : 0,
            stddevs: 0,
        }

        if (map.has(point)) {
            const existingCounts = map.get(point).counts;
            counts.count += existingCounts.count;
            counts.unclassified += existingCounts.unclassified;
            counts.unclassifiedDuplicate += existingCounts.unclassifiedDuplicate;
            counts.classified += existingCounts.classified;
            counts.classifiedDuplicate += existingCounts.classifiedDuplicate;
        }

        map.set(point,{
            point, 
            title, 
            counts: counts
        });
    }

    processItemForDuplicate(item) {
        this.addTweetToDuplicateCounts(item.text)
    }

    processItem(item) {
        this.numOutput++;

        this.addDuplicatedTweet(item);

        const timeStamp = moment(item.timeStamp);

        const day = timeStamp.format('YYYYMMDD');
        const hour = timeStamp.hour() / 24;

        const startofday = moment(timeStamp);
        startofday.startOf('day'); 

        const duration = moment.duration(startofday.diff(this.timeStart)).asDays();
        const durationDayRounded = Math.round(duration);

        const timepointHour = Number.parseFloat(duration) + hour;

        const timepointHourString = `${timepointHour}`;

        const iscat = !(!Array.isArray(item.cat) || item.cat.length === 0);
        const isdup = ('duplicate' in item) && item.duplicate;

        const values = {
            unclassified: !iscat && !isdup,
            unclassifiedDuplicate:  !iscat && isdup,
            classified: iscat && !isdup,
            classifiedDuplicate: iscat && isdup
        }

        this.addPoint(this.tweetsByHour,timepointHourString,  timeStamp.format('DD/MM/YY HH'),values);
        this.addPoint(this.tweetsByDay,durationDayRounded,  timeStamp.format('DD/MM/YY'),values);

    }

    //---------- calculate -----------------------------------------------------
    calcStats(map) {
        const values = [];       
        let it = map.keys();
        let result = it.next();

        this.total_count = 0;
        this.total_unclassified = 0;
        this.total_unclassifiedDuplicate = 0;
        this.total_classified = 0;
        this.classifiedDuplicate = 0;

        while (!result.done) {
            const item = map.get(result.value);
            values.push(item.counts.count);

            this.total_count += item.counts.count;
            this.total_unclassified += item.counts.unclassified;
            this.total_unclassifiedDuplicate += item.counts.unclassifiedDuplicate;
            this.total_classified += item.counts.classified;
            this.classifiedDuplicate += item.counts.classifiedDuplicate;
    
            result = it.next();
        }

        this.median = stats.median(values);
        this.mean = stats.mean(values);
        this.standardDeviation = stats.standardDeviation(values);
        this.sum = stats.sumSimple(values);

    }

    calcStormDays(map) {
        const values = [];       
        let it = map.keys();
        let result = it.next();

        this.numStormDays = 0;

        while (!result.done) {
            const item = map.get(result.value);
            
            item.counts.stddevs = this.standardDeviation > 0 ? 
                Math.abs(item.counts.count - this.mean) / this.standardDeviation : 0;

            item.isStorm = (item.counts.stddevs > 1.5) && (item.counts.count > 1000) && (item.counts.count > this.mean);
            if (item.isStorm)
                this.numStormDays++;

            values.push(item.counts.count);
            result = it.next();
        }

    }

    //-------- output ---------------------------------------
    outputMap(map) {
        const values = [];       
        let it = map.keys();
        let result = it.next();
        while (!result.done) {
            values.push(result.value);
            result = it.next();
        }

        const valuesSorted = values.sort((a, b) => Number.parseFloat(a) - Number.parseFloat(b));

        const titleStr = 'title,timepoint,isStorm,count,unclassified,unclassifiedDuplicate,classified,classifiedDuplicate,stddevs'
        fs.appendFileSync(this.outputFileName(), "\n" + titleStr + "\n");

        valuesSorted.forEach((h) => {
            const item = map.get(h);
            const outputStr = `${item.title},${item.point},${item.isStorm ? 1 : 0},${item.counts.count},${item.counts.unclassified},${item.counts.unclassifiedDuplicate},${item.counts.classified},${item.counts.classifiedDuplicate},${item.counts.stddevs}`;
            fs.appendFileSync(this.outputFileName(), outputStr + "\n");
        });
    }


    outputDuplicateItem(item) {
        const timeStamp = moment(item.timeStamp);
        const tweetTime = timeStamp.format('DD/MM/YY HH:mm:ss');
        
        const authorIsSubject = item.subject.sn == item.author.sn ? '1' : '0';

        const text = JSON.stringify(this.stormUtil.cleanMessage(item.text));

        const outputStr = `${item.duplicationCount},${authorIsSubject},"${tweetTime}",${text}`;
        fs.appendFileSync(this.outputFileName(), outputStr + "\n");
    }


    outputDuplicates(filterAuthorIsSubject) {

        this.sortDuplicate();


        const titleStr = 'count,authorIsSubject,time,original_tweet'
        fs.appendFileSync(this.outputFileName(), "\n" + titleStr + "\n");

        let numOutput = 0;

        for (let i=0; (i<this.duplicatedTweetsSorted.length) && (numOutput < DUPLICATE_OUTPUT_LIMIT);i++) {
            const authorIsSubject = this.duplicatedTweetsSorted[i].subject.sn == this.duplicatedTweetsSorted[i].author.sn;

            if (filterAuthorIsSubject === authorIsSubject) {
                numOutput++;
                this.outputDuplicateItem(this.duplicatedTweetsSorted[i]);
            }
        }
    }


    outputStats() {
        console.log(`${this.outputFileName()}, storm days => ${this.numStormDays}`);

        const statsFileName = 'output/stormStats.txt';

        if (!fs.existsSync(statsFileName)) {
            fs.appendFileSync(statsFileName, `screen_name, name, followers, numStormDays, median, mean, standardDeviation, count, unclassified, unclassifiedDuplicate, classified, classifiedDuplicate` + "\n");
        }
      
        fs.appendFileSync(statsFileName, `"${this.handle}", "${this.subject.name}", ${this.subject.followers_count}, ${this.numStormDays},${this.median},${this.mean},${this.standardDeviation},${this.total_count},${this.total_unclassified},${this.total_unclassifiedDuplicate},${this.total_classified},${this.classifiedDuplicate}` + "\n");

        fs.appendFileSync(this.outputFileName(), `Num Storm Days,${this.numStormDays}` + "\n");
        fs.appendFileSync(this.outputFileName(), `Median,${this.median}` + "\n");
        fs.appendFileSync(this.outputFileName(), `Mean,${this.mean}` + "\n");
        fs.appendFileSync(this.outputFileName(), `Standard deviation,${this.standardDeviation}` + "\n");
        fs.appendFileSync(this.outputFileName(), `Sum,${this.sum}` + "\n");
    }

    outputUserDetails() {
        this.handle = this.outputFileName();
        this.handle = this.handle.replace(/.*_/,'');
        this.handle = this.handle.replace(/\..*$/,'').toLocaleLowerCase();

        this.subject = this.subjects.get(this.handle);
        if (!this.subject) {
            this.subject = {
                "screen_name": "unknown",
                "name": "unknown",
                "description": "unknown",
                "followers_count": 0,
              };           
        }

        fs.appendFileSync(this.outputFileName(), `Screen name,"${this.handle}"` + "\n");

        fs.appendFileSync(this.outputFileName(), `Name,"${this.subject.name}"` + "\n");
        fs.appendFileSync(this.outputFileName(), `Description,"${this.subject.description}"` + "\n");
        fs.appendFileSync(this.outputFileName(), `Followers,${this.subject.followers_count}` + "\n");

    }



    //------------- event ------------------------------------------------
    waitForClose() {
        return new Promise((resolve) => {
            const it = setInterval(() => {
                if (this.closeReadOccured) {
                    clearInterval(it);
                    resolve();
                }
            }, 100);
        });
    }


    onStormFirstPassEvent(item) {
        this.closeReadOccured = false;
        this.processItemForDuplicate(item);
    }

    onStormCloseFirstPass(item) {
        this.closeReadOccured = true;
    }

    onStormSecondPassEvent(item) {
        this.closeReadOccured = false;
        this.processItem(item);
    }

    onStormCloseSecondPass(item) {
        this.closeReadOccured = true;
        this.outputUserDetails();

        this.calcStats(this.tweetsByDay);
        this.calcStormDays(this.tweetsByDay);

        this.outputStats();


        if (!this.statsByHour) {
            this.outputMap(this.tweetsByDay);
        } else {
            this.outputMap(this.tweetsByHour);
        }

        this.outputDuplicates(false);
        this.outputDuplicates(true);
    }



    
}

module.exports = StormCounter;
