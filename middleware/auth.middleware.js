const jwt = require('jsonwebtoken');
const User = require('../models/user.model');

const auth = async (req, res, next) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');
        if (!token) {
            throw new Error();
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret');
        const user = await User.findById(decoded.id);

        if (!user) {
            throw new Error();
        }

        req.user = user;
        req.token = token;
        next();
    } catch (e) {
        res.status(401).send({ error: 'Please authenticate.' });
    }
};

const isCoordinator = (req, res, next) => {
    if (req.user && req.user.role === 'Coordinator') {
        next();
    } else {
        res.status(403).send({ error: 'Access denied. Coordinator role required.' });
    }
};

module.exports = { auth, isCoordinator };
