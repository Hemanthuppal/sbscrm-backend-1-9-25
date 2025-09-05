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
 


app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});