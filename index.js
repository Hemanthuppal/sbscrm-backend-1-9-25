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
app.use('/api', Comment);
 

// const POLL_MS = Number(process.env.IMAP_POLL_MS || 120000);
// setInterval(fetchAndProcessEmails, POLL_MS);
// console.log("Starting email processing with interval:", POLL_MS / 1000, "seconds");
// fetchAndProcessEmails();
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});