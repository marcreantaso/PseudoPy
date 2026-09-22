// Shared default profile for the existing administrator account (u1).
// Credentials use the same salted hash format as the current password flow.
function getDefaultAdminProfile() {
    return {
        "fullName": "Admin",
        "username": "Admin",
        "password": null,
        "passwordHash": "804f4cba316ed81a095847efadc18b169d745f54ada7b651c85c4913439fbfe7",
        "passwordSalt": "9d9ad9d3642056bbff2c80d102f97610"
    };
}

// Only migrate the known legacy account. Renamed accounts (including later
// password changes) and all other roles/accounts are left untouched.
function upgradeDefaultAdminAccount(user) {
    if (!user || (user._docId || user.id) !== 'u1' || user.role !== 'admin' || user.username !== 'mbautista_admin') return user;
    return { ...user, ...getDefaultAdminProfile() };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getDefaultAdminProfile, upgradeDefaultAdminAccount };
}
