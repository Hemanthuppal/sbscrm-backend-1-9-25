// EmailLeads/EmailLeads.js
require('dotenv').config();
const imaps = require('imap-simple');
const { simpleParser } = require('mailparser');
const openRouterAI = require('../Aiprompt/Aiprompt');
const { insertOrUpdateContact } = require('../Aiprompt/Helper');
const net = require('net');

const imapConfig = {
    imap: {
        user: process.env.MAIL_USER,
        password: process.env.MAIL_APP_PASS,
        host: 'imap.gmail.com',
        port: 993,
        tls: true,
        connTimeout: 20000,
        authTimeout: 20000,
        socketTimeout: 60000,
        tlsOptions: { rejectUnauthorized: false },
        debug: (msg) => console.log('[imap-debug]', msg)
    }
};

function getEmailInfo(parsed, header) {
    let fromEmail = 'unknown@example.com';
    let fromName = 'Unknown';
    let subject = 'No Subject';
    let messageId = 'No Message ID';

    try {
        if (parsed.from?.value?.[0]) {
            fromEmail = parsed.from.value[0].address || fromEmail;
            fromName = parsed.from.value[0].name || fromName;
        } else if (header?.from) {
            const fromHeader = Array.isArray(header.from) ? header.from[0] : header.from;
            if (typeof fromHeader === 'string') {
                const emailMatch = fromHeader.match(/<([^>]+)>/);
                if (emailMatch) {
                    fromEmail = emailMatch[1];
                    const nameMatch = fromHeader.match(/(.*)</);
                    if (nameMatch?.[1]) fromName = nameMatch[1].trim();
                } else {
                    fromEmail = fromHeader;
                }
            }
        }

        if (parsed.subject) subject = parsed.subject;
        else if (header?.subject) subject = Array.isArray(header.subject) ? header.subject[0] : header.subject;
         if (header?.['message-id']) {
            messageId = header['message-id'] || messageId;
        }
console.log(`Extracted Message ID: ${messageId}`); 
    } catch (error) {
        console.error('Error extracting email info:', error);
    }

    return { fromEmail, fromName, subject };
}

async function fetchAndProcessEmails() {
    let connection;
    try {
        console.log('Connecting to IMAP server...');
        connection = await imaps.connect(imapConfig);
        await connection.openBox('INBOX');

        const searchCriteria = ['UNSEEN'];
        const fetchOptions = {
            bodies: ['HEADER', 'TEXT'],
            markSeen: true
        };

        const messages = await connection.search(searchCriteria, fetchOptions);
        console.log(`Found ${messages.length} new email(s) to process`);

        let processedCount = 0;
        let filteredCount = 0;
        let productRequirementsCount = 0;
        let matchedProductsCount = 0;

        for (const message of messages) {
            try {
                const header = message.parts.find((p) => p.which === 'HEADER')?.body;
                const text = message.parts.find((p) => p.which === 'TEXT')?.body;

                const parsed = await simpleParser(text || message.parts.map(p => p.body || '').join('\n') || '');
                const { fromEmail, fromName, subject,messageId  } = getEmailInfo(parsed, header);
                const emailBody = text || message.parts.map(p => p.body || '').join('\n') || '';
const rawEmailContent = emailBody; 
                console.log('\n=== Processing Email ===');
                console.log(`From: ${fromName} <${fromEmail}>`);
                console.log(`Subject: ${subject}`);
                console.log(`Body length: ${emailBody.length} chars`);
                console.log(`Email body sample: ${emailBody.substring(0, 500) + '...'}`);

                const extractedData = await openRouterAI.extractContactInfo(emailBody, subject, fromEmail, fromName);

                if (!extractedData) {
                    console.log('Email filtered out - not a contact inquiry');
                    filteredCount++;
                    continue;
                }

                console.log('AI Extracted:', JSON.stringify(extractedData, null, 2));
                processedCount++;

                if (extractedData.products.length > 0) {
                    console.log('Product Requirements Found:', extractedData.products);
                    productRequirementsCount++;
                } else {
                    console.log('No product requirements found in this email');
                }

                if (extractedData.matchedProducts.length > 0) {
                    console.log('Matched Products Found:', extractedData.matchedProducts);
                    matchedProductsCount += extractedData.matchedProducts.length;
                } else {
                    console.log('No matched products found for this email');
                }

                insertOrUpdateContact(extractedData,rawEmailContent,messageId, (err, result) => {
                    if (err) {
                        console.error('DB save error:', err);
                        return;
                    }
                    console.log(`Saved/Updated contact: ${extractedData.email}`);
                });
            } catch (error) {
                console.error('Error processing an email:', error.message);
            }
        }

        console.log(`\nProcessing complete: ${processedCount} contacts saved, ${filteredCount} emails filtered out, ${productRequirementsCount} product requirements found, ${matchedProductsCount} matched products saved`);

    } catch (error) {
        console.error('IMAP connection error:', error.message);
    } finally {
        if (connection) {
            try {
                await connection.end();
            } catch (endError) {
                console.error('Error closing IMAP connection:', endError.message);
            }
        }
    }
}

async function testPort(host, port) {
    return new Promise((resolve, reject) => {
        const s = net.createConnection({ host, port, timeout: 8000 }, () => {
            s.end();
            resolve(true);
        });
        s.on('error', reject);
        s.on('timeout', () => { s.destroy(); reject(new Error('timeout')); });
    });
}

module.exports = { fetchAndProcessEmails, testPort };