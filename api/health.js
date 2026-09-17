module.exports = (req,res)=> {
    res.setHeader('Cache-Control','no-store');
    res.json({status:'ok',storage:'Firestore',authenticationConfigured:!!process.env.SESSION_SECRET});
};
