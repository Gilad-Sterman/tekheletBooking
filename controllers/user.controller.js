const User = require('../models/user.model');

exports.getUsers = async (req, res) => {
    try {
        const users = await User.find()
            .select('name email role googleTokens');
        res.json(users);
    } catch (err) {
        console.error('Error fetching users:', err);
        res.status(500).json({ message: err.message });
    }
};
