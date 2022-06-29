// Copyright (c) Susan Watson 2020-2022 All rights reserved
// This software is published under the GNU GENERAL PUBLIC LICENSE version 3.

const fs = require('fs');
var program = require('commander');
var Twit = require('twit')
var StormSearcher = require('./stormsearcher');
var StormWatcher = require('./stormwatcher');
var StormCounter = require('./stormcounter');
var StormReader = require('./stormreader');
var StormCategorizer = require('./stormcategorizer');

const subjectsFileName = 'users_subjects.json';

let consumer_key = process.env.TWITTER_CONSUMER_KEY || 'kkkkkkkkkkkkkkkkkkkkkkk';
let consumer_secret = process.env.TWITTER_CONSUMER_SECRET || 'sssssssssssssssssssssssssssssssssssssssssss';
let access_token_key = process.env.TWITTER_ACCESS_TOKEN_KEY || 'ttttttttttt-ttttttttttttttttttttttttttttttttttttttt';
let access_token_secret = process.env.TWITTER_ACCESS_TOKEN_SECRET || 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

var T = new Twit({
  consumer_key: consumer_key,
  consumer_secret: consumer_secret,
  access_token: access_token_key,
  access_token_secret: access_token_secret,
  timeout_ms: 60 * 1000,  // optional HTTP request timeout to apply to all requests. 
})

let stormSearcher = new StormSearcher(T);
let stormWatcher = new StormWatcher();

function checkInputAndOutputAreDifferent(input,output) {
  if (input === output) {
    console.log('The input and output files must be different.');
    throw new Error('The input and output files must be different.');
  }
}

function readSubjects(fileName) {
  const subjectstr = fs.readFileSync(fileName,'utf8');
  const subjects = JSON.parse(subjectstr);
  return subjects;
}

function makeFilter(program) {
  return StormReader.makeFilter(
    program.filtersn, 
    program.filterduplicates, 
    program.filteronlyduplicates,
    program.filteruncategorized,
    program.filterauthor
    );
}


async function statisticsFirstPass(tweetsfilename,stormCounter, program) {
  const reader = new StormReader();
  reader.on('stormEvent', stormCounter.onStormFirstPassEvent.bind(stormCounter));
  reader.on('stormClose', stormCounter.onStormCloseFirstPass.bind(stormCounter));
  await reader.read(tweetsfilename, 
    makeFilter(program),
    program.stats);
  await stormCounter.waitForClose();
}

async function statisticsSecondPass(tweetsfilename,stormCounter, program) {
  const reader = new StormReader();
  reader.on('stormEvent', stormCounter.onStormSecondPassEvent.bind(stormCounter));
  reader.on('stormClose', stormCounter.onStormCloseSecondPass.bind(stormCounter));
  await reader.read(tweetsfilename, 
    makeFilter(program),
    program.stats);
    await stormCounter.waitForClose();
  }

async function statisticsOperation(program, tweetsfilename, statsByHour) {
  let stormCounter = new StormCounter();
  stormCounter.setStatsByHour(statsByHour);
  stormCounter.addSubjects(readSubjects(subjectsFileName));
  stormCounter.setOutput(program.output || 'stats.txt');
  checkInputAndOutputAreDifferent(tweetsfilename,stormCounter.outputFileName());
  await statisticsFirstPass(tweetsfilename,stormCounter, program);
  await statisticsSecondPass(tweetsfilename,stormCounter, program);
}


async function processOperation(program) {

  if (program.outputformat) {
    stormWatcher.setOutputFormat(program.outputformat);
  }

  if (program.prettyprint) {
    // pretty print tweets
    const reader = new StormReader();
    reader.addSubjects(readSubjects(subjectsFileName));
    await reader.prettyPrint(program.prettyprint, 
      makeFilter(program),
      program.stats);

  } else if (program.categorize) {
    // categorize the tweets
    stormWatcher.setOutput(program.output || 'tweetsCategorized.txt');
    checkInputAndOutputAreDifferent(program.categorize,stormWatcher.outputFileName());
    const reader = new StormReader();
    const categorizer = new StormCategorizer();
    await categorizer.loadCorpus(program.corpus);
    reader.on('stormEvent', categorizer.onStormEvent.bind(categorizer));
    categorizer.on('stormEvent', stormWatcher.onStormEvent.bind(stormWatcher));
    await reader.read(program.categorize, 
      makeFilter(program),
      program.stats);

    } else if (program.extract) {
      // extract the tweets
      if (program.outputSplit) {
        stormWatcher.setAddSubjectToFilename(true);
        stormWatcher.setOutput(program.outputSplit || 'tweetsExtracted.txt');
      }
      else
        stormWatcher.setOutput(program.output || 'tweetsExtracted.txt');
      checkInputAndOutputAreDifferent(program.extract,stormWatcher.outputFileName());
      const reader = new StormReader();
      reader.on('stormEvent', stormWatcher.onStormEvent.bind(stormWatcher));
      await reader.read(program.extract, 
        makeFilter(program),
        program.stats);

      } else if (program.idduplicates) {
        // categorize the tweets
        stormWatcher.setOutput(program.output || 'tweetsDeduplicated.txt');
        checkInputAndOutputAreDifferent(program.idduplicates,stormWatcher.outputFileName());
        const reader = new StormReader();
        reader.identifyDuplicates = true;
        reader.on('stormEvent', stormWatcher.onStormEvent.bind(stormWatcher));
        await reader.read(program.idduplicates, 
          makeFilter(program),
          program.stats);


  } else if (program.statistics) {
    await statisticsOperation(program,program.statistics,false);
  } else if (program.statisticsbyhour) {
    await statisticsOperation(program,program.statisticsbyhour,true);
  } else if (program.screennames) {
    // lookup screen names
    const input = program.screennames || 'subjects.txt';
    const outputFile = program.output || subjectsFileName;
    const reader = new StormReader();
    const subjects = await reader.readSubjectList(input); 
    const details = await stormSearcher.lookupUserDetails(subjects);
    fs.writeFileSync(outputFile, JSON.stringify(details,null,2));
    
  } else {
    // search twitter
    stormSearcher.on('stormEvent', stormWatcher.onStormEvent.bind(stormWatcher));
    stormWatcher.setAddDateToFilename(true);
    stormWatcher.setOutput(program.output || 'data/tweets');
    stormSearcher.addSubjects(readSubjects(subjectsFileName));
    stormSearcher.startListening();
  } 
}


//--------------------------------------------------------------------

program
  .version('1.0.0')
  .option('-p, --prettyprint <filename>', 'read the tweets and pretty print them')
  .option('-c, --categorize <filename>', 'categorize the tweets in the given file')
  .option('-e, --extract <filename>', 'extract the tweets in the given file')
  .option('-i, --statistics <filename>', 'calculate statistics')
  .option('-I, --statisticsbyhour <filename>', 'calculate statistics by hour')

  .option('-l, --idduplicates <filename>', 'identify duplicate tweets in the given file')

  .option('-o, --output <filename>', 'file to output to')
  .option('-O, --outputSplit <filename>', 'files to output to, using subject')

  .option('-m, --outputformat <formatType>', 'output format; json, text')


  .option('-s, --screennames <filename>', 'load the screen names from the text file')
  .option('-r, --corpus <filename>', 'categorize the tweets using the given corpus')

  .option('-f, --filtersn <screenname>', 'filter to just the specified subject')
  .option('-a, --filterauthor <screenname>', 'filter to just the specified author')
  .option('-d, --filterduplicates', 'filter to remove duplicate retweets')
  .option('-D, --filteronlyduplicates', 'filter to remove non-duplicate retweets')
  .option('-u, --filteruncategorized', 'filter to remove uncategorized tweets')

  .option('-t, --stats', 'output stats')
  .parse(process.argv);

processOperation(program);  












