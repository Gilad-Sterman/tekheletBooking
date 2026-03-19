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
