const aws = require('aws-sdk');
const s3 = new aws.S3({apiVersion: '2006-03-01'});
const fs = require('fs');
const tar = require('tar');
const puppeteer = require('puppeteer');
const config = require('./config');

let browser = null;
exports.getBrowser = async options => {
    if (typeof browser === 'undefined' || !await isBrowserAvailable(browser)) {
        if (config.localChromePath || config.remoteChromeS3Bucket) {
            await setupChrome();
            browser = await puppeteer.launch(Object.assign({
                headless: true,
                executablePath: config.executablePath,
                args: config.launchOptionForLambda,
                dumpio: !!exports.DEBUG,
                ignoreHTTPSErrors: true
            }, options));
        } else {
            browser = await puppeteer.launch(Object.assign({
                dumpio: !!exports.DEBUG,
                ignoreHTTPSErrors: true
            }, options));
        }

        debugLog(async (b) => `launch done: ${await browser.version()}`);
    }
    return browser;
};

const isBrowserAvailable = async (browser) => {
    try {
        await browser.version();
    } catch (e) {
        debugLog(e); // not opened etc.
        return false;
    }
    return true;
};

const setupChrome = async () => {
    if (!await existsExecutableChrome()) {
        if (await existsLocalChrome()) {
            debugLog('setup local chrome');
            await setupLocalChrome();
        } else {
            debugLog('setup s3 chrome');
            await setupS3Chrome();
        }
        debugLog('setup done');
    }
};

const existsLocalChrome = () => {
    return new Promise((resolve, reject) => {
        fs.exists(config.localChromePath, (exists) => {
            resolve(exists);
        });
    });
};

const existsExecutableChrome = () => {
    return new Promise((resolve, reject) => {
        fs.exists(config.executablePath, (exists) => {
            resolve(exists);
        });
    });
};

const setupLocalChrome = () => {
    return new Promise((resolve, reject) => {
        fs.createReadStream(config.localChromePath)
            .on('error', (err) => reject(err))
            .pipe(tar.x({
                C: config.setupChromePath,
            }))
            .on('error', (err) => reject(err))
            .on('end', () => resolve());
    });
};

const setupS3Chrome = () => {
    return new Promise((resolve, reject) => {
        const params = {
            Bucket: config.remoteChromeS3Bucket,
            Key: config.remoteChromeS3Key,
        };
        s3.getObject(params)
            .createReadStream()
            .on('error', (err) => reject(err))
            .pipe(tar.x({
                C: config.setupChromePath,
            }))
            .on('error', (err) => reject(err))
            .on('end', () => resolve());
    });
};

const debugLog = (log) => {
    if (config.DEBUG) {
        let message = log;
        if (typeof log === 'function') message = log();
        Promise.resolve(message).then(
            (message) => console.log(message)
        );
    }
};
