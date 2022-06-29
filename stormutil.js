// Copyright (c) Susan Watson 2020-2022 All rights reserved
// This software is published under the GNU GENERAL PUBLIC LICENSE version 3.

const crypto = require('crypto');

class StormUtil {
    constructor() {
  
        this.whitespacePattern = new RegExp('\\s+','gm');        
        this.retweetPattern = new RegExp('^RT\\s+','i');
        this.handlePattern = new RegExp('^@\\S+\\s+','i');

        this.urlPostfixPattern = new RegExp('https://t.co/\\S+$','i');
        this.trailingWhitespace = new RegExp('\\s+$','i');
    }



    cleanMessage(text, removeRT) {
        let base = text;

        base = base.replace(this.whitespacePattern,' ');

        return base;
    }

    coreMessage(text) {
        let base = text;

        // remove tweet and leading name tags
        base = base.replace(this.retweetPattern,'');

        base = base.replace(this.whitespacePattern,' ');

        base = base.replace(this.urlPostfixPattern,' ');

        while (this.handlePattern.test(base)) {
            base = base.replace(this.handlePattern,'');
        }

        base = base.replace(this.trailingWhitespace,' ');

        return base;
    }


    extractBaseMessage(text) {
        const base = this.coreMessage(text);
        const hash = crypto.createHash('sha256');
        hash.update(base);
        return hash.digest('base64');
    }


}

module.exports = StormUtil;


