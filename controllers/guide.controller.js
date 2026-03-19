const Guide = require('../models/guide.model');

// Get all active guides
exports.getGuides = async (req, res) => {
    try {
        const guides = await Guide.find({ isActive: true })
            .select('-__v -createdAt -updatedAt -userId -notes')
            .sort({ name: 1 });

        res.json({
            success: true,
            data: guides,
            count: guides.length
        });
    } catch (err) {
        console.error('Error fetching guides:', err);
        res.status(500).json({ 
            success: false,
            message: 'Failed to fetch guides',
            error: err.message 
        });
    }
};

// Get guide by ID
exports.getGuideById = async (req, res) => {
    try {
        const guide = await Guide.findById(req.params.id);
        
        if (!guide) {
            return res.status(404).json({ 
                success: false,
                message: 'Guide not found' 
            });
        }

        res.json({
            success: true,
            data: guide
        });
    } catch (err) {
        console.error('Error fetching guide:', err);
        res.status(500).json({ 
            success: false,
            message: 'Failed to fetch guide',
            error: err.message 
        });
    }
};
