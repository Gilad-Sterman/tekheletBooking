const AppConfig = require('../models/appConfig.model');

// Get all configurations
exports.getAllConfigurations = async (req, res) => {
    try {
        const configs = await AppConfig.find({ isActive: true })
            .select('-__v -createdAt -updatedAt -modifiedBy')
            .sort({ category: 1, key: 1 });

        // Transform into a more usable format for frontend
        const configData = {};
        
        configs.forEach(config => {
            if (!configData[config.category]) {
                configData[config.category] = {};
            }
            configData[config.category][config.key] = config.value;
        });

        res.json({
            success: true,
            data: configData,
            lastUpdated: new Date().toISOString()
        });
    } catch (err) {
        console.error('Error fetching configurations:', err);
        res.status(500).json({ 
            success: false,
            message: 'Failed to fetch configurations',
            error: err.message 
        });
    }
};

// Only these categories may be edited through the API (coordinator-only).
// Other configs (pricing, statuses, etc.) stay DB-managed to avoid breaking the app.
const EDITABLE_CATEGORIES = new Set(['email_automation']);

// Update a single config value — used by the Settings page.
exports.updateConfigValue = async (req, res) => {
    try {
        const { category, key } = req.params;
        if (!EDITABLE_CATEGORIES.has(category)) {
            return res.status(403).json({ success: false, message: 'This configuration category is not editable' });
        }
        if (req.body.value === undefined) {
            return res.status(400).json({ success: false, message: 'value is required' });
        }
        const config = await AppConfig.findOneAndUpdate(
            { category, key },
            { $set: { value: req.body.value, lastModified: new Date(), modifiedBy: req.user._id } },
            { returnDocument: 'after' }
        );
        if (!config) {
            return res.status(404).json({ success: false, message: `Config ${category}/${key} not found` });
        }
        res.json({ success: true, data: { category: config.category, key: config.key, value: config.value } });
    } catch (err) {
        console.error('Error updating configuration:', err);
        res.status(500).json({ success: false, message: 'Failed to update configuration', error: err.message });
    }
};
