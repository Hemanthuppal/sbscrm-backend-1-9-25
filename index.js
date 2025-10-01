const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const Users = require('./Routes/Users/UsersRoute');
const Leads = require('./Routes/Leads/LeadsRoute');
const Employee = require('./Routes/Users/authRoutes');
const AllTeambers = require('./Routes/Users/employeeRoutes');
const GetemployeebyidRoute = require('./Routes/Users/getemployeebyidRoute');
const QuotationRoutes = require('./Routes/Quotations/QuotationRoutes');
const ProductRoutes = require('./Routes/Products/ProductRoutes')
const Assignment = require('./Routes/Assign/assignmentRoute');
const SendQuotationRoutes = require('./Routes/Quotations/SendQuotationRoutes');
const APIRoutes = require('./Routes/AiApi/AiRoute');
const InventoryRoutes = require('./Routes/Inventory/InventoryRoutes');

const db = require('./Config/db');
const { fetchAndProcessEmails, testPort } = require('./EmailLeads/Eamilleads');
const openRouterAI = require('./Aiprompt/Aiprompt');

const Comment = require('./Routes/Comments/Comments');
// const { fetchAndProcessEmails } = require('./EmailLeads/Eamilleads');
const path = require("path");
const app = express();
const PORT = process.env.PORT || 5000;
app.use(bodyParser.json());
app.use(cors());

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use("/uploads", express.static("uploads"));
app.use('/api', Users);
app.use('/api', Leads);
app.use('/api', Employee);
app.use('/api', AllTeambers);
app.use('/api', GetemployeebyidRoute);
app.use('/api', QuotationRoutes);
app.use('/api', ProductRoutes);
app.use('/api', Assignment);
app.use('/api',SendQuotationRoutes);
app.use('/api', Comment);
app.use('/api', InventoryRoutes);
 
app.use('/api', APIRoutes);

(async () => {
    try {
        await testPort('imap.gmail.com', 993);
        console.log('TCP to imap.gmail.com:993 OK');
    } catch (e) {
        console.error('Cannot reach imap.gmail.com:993:', e.message);
    }

    const POLL_MS = Number(process.env.IMAP_POLL_MS || 120000);
    setInterval(fetchAndProcessEmails, POLL_MS);
    console.log('Starting AI-powered email fetcher with OpenRouter integration...');
    console.log(`AI Confidence Threshold: ${openRouterAI.minConfidence}, Match Confidence Threshold: ${openRouterAI.matchConfidenceThreshold}`);
    fetchAndProcessEmails();

    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
})();