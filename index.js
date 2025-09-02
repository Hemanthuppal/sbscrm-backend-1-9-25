const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const Users = require('./Routes/Users/UsersRoute');
const Leads = require('./Routes/Leads/LeadsRoute');
const path = require("path");
const app = express();
const PORT = process.env.PORT || 5000;
app.use(bodyParser.json());
app.use(cors());

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use("/uploads", express.static("uploads"));
app.use('/api', Users);
app.use('/api', Leads);
 


app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});