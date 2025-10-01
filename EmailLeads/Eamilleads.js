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
        // FROM
        if (parsed.from?.value?.[0]) {
            fromEmail = parsed.from.value[0].address || fromEmail;
            fromName = parsed.from.value[0].name || fromName;
        }

        // SUBJECT
        if (parsed.subject) {
            subject = parsed.subject;
        }

        // MESSAGE-ID (use simpleParser result)
        if (parsed.messageId) {
            messageId = parsed.messageId;
        } else if (parsed.headers?.has('message-id')) {
            messageId = parsed.headers.get('message-id');
        }

        console.log(`Extracted Message ID: ${messageId}`);
    } catch (error) {
        console.error('Error extracting email info:', error);
    }

    return { fromEmail, fromName, subject, messageId };
}



async function fetchAndProcessEmails() {
    let connection;
    try {
        console.log('Connecting to IMAP server...');
        connection = await imaps.connect(imapConfig);
        const box = await connection.openBox('INBOX');

        const totalMessages = box.messages.total;
        if (totalMessages === 0) {
            console.log('No emails in inbox');
            return;
        }

        const now = new Date();
        const twoMinutesAgo = new Date(now.getTime() - 2 * 60 * 1000);
        const batchSize = 10; // Adjust batch size as needed

        let processedCount = 0;
        let filteredCount = 0;
        let productRequirementsCount = 0;
        let matchedProductsCount = 0;

        let hasMore = true;
        let currentEnd = totalMessages;

        while (hasMore) {
            let currentStart = currentEnd - batchSize + 1;
            if (currentStart < 1) currentStart = 1;
            const sequence = `${currentStart}:${currentEnd}`;
            console.log(`Fetching batch: ${sequence}`);

            const fetcher = connection.imap.seq.fetch(sequence, {
                bodies: ['HEADER', 'TEXT'],
                markSeen: false
            });

            const batchMessages = await new Promise((resolve, reject) => {
                const msgs = [];
                fetcher.on('message', (msg, seqno) => {
                    console.log('Message #%d', seqno);
                    let parts = [];
                    msg.on('body', (stream, info) => {
                        let buffer = '';
                        stream.on('data', (chunk) => {
                            buffer += chunk.toString('utf8');
                        });
                        stream.once('end', () => {
                            parts.push({
                                which: info.which || '',
                                body: buffer
                            });
                        });
                    });
                    msg.once('attributes', (attrs) => {
                        msg.attributes = attrs;
                    });
                    msg.once('end', () => {
                        msg.parts = parts;
                        msgs.push(msg);
                    });
                });
                fetcher.once('error', reject);
                fetcher.once('end', () => {
                    console.log('Done fetching batch');
                    resolve(msgs);
                });
            });

            let oldestDate = now;
            let batchHasRecent = false;

            for (const message of batchMessages) {
                const msgDate = message.attributes.date;
                if (msgDate < oldestDate) oldestDate = msgDate;

                if (msgDate < twoMinutesAgo) {
                    continue; // Skip emails older than 2 minutes
                }

                batchHasRecent = true;

                try {
                    const headerBody = message.parts.find((p) => p.which === 'HEADER')?.body || '';
                    const textBody = message.parts.find((p) => p.which === 'TEXT')?.body || '';
                    const fullEmail = headerBody + '\r\n\r\n' + textBody;

                    const parsed = await simpleParser(fullEmail);
                    const header = headerBody;

                    const { fromEmail, fromName, subject, messageId } = getEmailInfo(parsed);

                    const emailBody = textBody;
                    const rawEmailContent = emailBody;

                    console.log('\n=== Processing Email ===');
                    console.log(`From: ${fromName} <${fromEmail}>`);
                    console.log(`Subject: ${subject}`);
                    console.log(`Message-ID: ${messageId || 'Not found'}`);
                    console.log(`Body length: ${emailBody.length} chars`);
                    console.log(`Email body sample: ${emailBody.substring(0, 500) + '...'}`);

                    const extractedData = await openRouterAI.extractContactInfo(emailBody, subject, fromEmail, fromName);

                    if (!extractedData) {
                        console.log('Email filtered out - not a contact inquiry');
                        filteredCount++;
                        continue; // remains unseen
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

                    // ✅ Save contact info, only mark as seen if success
                    await new Promise((resolve, reject) => {
                        insertOrUpdateContact(extractedData, rawEmailContent, messageId, (err, result) => {
                            if (err) {
                                console.error('DB save error:', err);
                                reject(err);
                            } else {
                                console.log(`Saved/Updated contact: ${extractedData.email}`);
                                resolve(result);
                            }
                        });
                    });

                    // ✅ Mark only this email as seen after DB save
                    try {
                        await connection.addFlags(message.attributes.uid, ['\\Seen']);
                        console.log(`Marked as seen: Message UID ${message.attributes.uid}`);
                    } catch (flagErr) {
                        console.error('Error marking email as seen:', flagErr.message);
                    }

                } catch (error) {
                    console.error('Error processing an email:', error.message);
                }
            }

            if (!batchHasRecent || currentStart === 1) {
                hasMore = false;
            } else {
                currentEnd = currentStart - 1;
            }

            if (oldestDate < twoMinutesAgo) {
                hasMore = false;
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