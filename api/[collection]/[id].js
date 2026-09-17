const { handle } = require('../../backend/service');
module.exports = (req,res)=>handle(req,res,req.query.collection,req.query.id);
