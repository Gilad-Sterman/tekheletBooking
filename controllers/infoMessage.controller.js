const InfoMessage = require('../models/infoMessage.model');

exports.getInfoMessages = async (req, res) => {
    try {
        const messages = await InfoMessage.find().sort({ date: 1 });
        res.json(messages);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

exports.createInfoMessage = async (req, res) => {
    try {
        const newMessage = new InfoMessage(req.body);
        const savedMessage = await newMessage.save();
        res.status(201).json(savedMessage);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
};

exports.updateInfoMessage = async (req, res) => {
    try {
        const updatedMessage = await InfoMessage.findByIdAndUpdate(
            req.params.id,
            req.body,
            { returnDocument: 'after', runValidators: true }
        );
        if (!updatedMessage) return res.status(404).json({ message: 'Message not found' });
        res.json(updatedMessage);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
};

exports.deleteInfoMessage = async (req, res) => {
    try {
        const deletedMessage = await InfoMessage.findByIdAndDelete(req.params.id);
        if (!deletedMessage) return res.status(404).json({ message: 'Message not found' });
        res.json({ message: 'Message deleted' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};
