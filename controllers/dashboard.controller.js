const Tour = require('../models/tour.model');
const { startOfMonth, endOfMonth, subMonths, format } = require('date-fns');

/**
 * Get comprehensive dashboard statistics
 */
exports.getDashboardStatistics = async (req, res) => {
    try {
        const { dateRange = '6months', tourType = 'all', groupType = 'all', guide = 'all', language = 'all' } = req.query;
        
        // Calculate date filter
        const dateFilter = getDateFilter(dateRange);
        
        // Build match criteria
        const matchCriteria = {
            ...(dateFilter && { date: dateFilter }),
            ...(tourType !== 'all' && getTourTypeFilter(tourType)),
            ...(language !== 'all' && { language }),
            ...(guide !== 'all' && { $or: [{ primaryGuide: guide }, { assignedGuides: guide }] })
        };

        // Add group type filter if specified
        const groupMatchCriteria = groupType !== 'all' ? { 'groups.type': groupType } : {};

        // Aggregate all statistics
        const [
            overviewStats,
            timeData,
            groupTypeStats,
            geographyStats,
            financialStats,
            engagementStats
        ] = await Promise.all([
            getOverviewStatistics(matchCriteria, groupMatchCriteria, dateRange),
            getTimeBasedData(matchCriteria, groupMatchCriteria, dateRange),
            getGroupTypeDistribution(matchCriteria, groupMatchCriteria),
            getGeographicDistribution(matchCriteria, groupMatchCriteria),
            getFinancialStatistics(matchCriteria, groupMatchCriteria),
            getEngagementStatistics(matchCriteria, groupMatchCriteria)
        ]);

        res.json({
            overview: overviewStats,
            timeData,
            groupTypes: groupTypeStats,
            geography: geographyStats,
            financial: financialStats,
            engagement: engagementStats
        });
    } catch (error) {
        console.error('Error fetching dashboard statistics:', error);
        res.status(500).json({ message: 'Failed to fetch dashboard statistics' });
    }
};

/**
 * Get date filter based on range
 */
function getDateFilter(dateRange) {
    const now = new Date();
    
    switch (dateRange) {
        case '1month':
            return { $gte: format(subMonths(now, 1), 'yyyy-MM-dd') };
        case '3months':
            return { $gte: format(subMonths(now, 3), 'yyyy-MM-dd') };
        case '6months':
            return { $gte: format(subMonths(now, 6), 'yyyy-MM-dd') };
        case '1year':
            return { $gte: format(subMonths(now, 12), 'yyyy-MM-dd') };
        case 'all':
        default:
            return null;
    }
}

/**
 * Get tour type filter
 */
function getTourTypeFilter(tourType) {
    switch (tourType) {
        case 'workshop':
            return { isWorkshop: true };
        case 'shiur':
            return { isShiur: true };
        case 'regular':
            return { isWorkshop: false, isShiur: false };
        default:
            return {};
    }
}

/**
 * Get overview statistics
 */
async function getOverviewStatistics(matchCriteria, groupMatchCriteria, dateRange) {
    const pipeline = [
        { $match: matchCriteria },
        ...(Object.keys(groupMatchCriteria).length > 0 ? [{ $match: groupMatchCriteria }] : []),
        {
            $group: {
                _id: null,
                totalTours: { $sum: 1 },
                completedTours: {
                    $sum: {
                        $cond: [{ $lt: ['$date', format(new Date(), 'yyyy-MM-dd')] }, 1, 0]
                    }
                },
                totalGroups: { $sum: { $size: '$groups' } },
                confirmedGroups: {
                    $sum: {
                        $size: {
                            $filter: {
                                input: '$groups',
                                cond: { $eq: ['$$this.status', 'Confirmed'] }
                            }
                        }
                    }
                },
                totalParticipants: {
                    $sum: {
                        $reduce: {
                            input: '$groups',
                            initialValue: 0,
                            in: {
                                $add: [
                                    '$$value',
                                    { $add: [
                                        { $ifNull: ['$$this.counts.regular', 0] },
                                        { $ifNull: ['$$this.counts.seniorSoldier', 0] },
                                        { $ifNull: ['$$this.counts.child', 0] }
                                    ]}
                                ]
                            }
                        }
                    }
                },
                totalRevenue: {
                    $sum: {
                        $reduce: {
                            input: '$groups',
                            initialValue: 0,
                            in: {
                                $add: [
                                    '$$value',
                                    { $ifNull: ['$$this.booking.totalCost', 0] },
                                    { $ifNull: ['$$this.postVisit.donation.amount', 0] }
                                ]
                            }
                        }
                    }
                }
            }
        }
    ];

    const result = await Tour.aggregate(pipeline);
    const stats = result[0] || {
        totalTours: 0,
        completedTours: 0,
        totalGroups: 0,
        confirmedGroups: 0,
        totalParticipants: 0,
        totalRevenue: 0
    };

    // Calculate averages
    stats.avgParticipantsPerTour = stats.totalTours > 0 ? Math.round(stats.totalParticipants / stats.totalTours) : 0;
    stats.avgRevenuePerTour = stats.totalTours > 0 ? Math.round(stats.totalRevenue / stats.totalTours) : 0;

    // Calculate trends (simplified - would need historical comparison for real trends)
    stats.toursTrend = 12; // Placeholder
    stats.groupsTrend = 8;
    stats.participantsTrend = 15;
    stats.revenueTrend = 22;

    return stats;
}

/**
 * Get time-based data
 */
async function getTimeBasedData(matchCriteria, groupMatchCriteria, dateRange) {
    const months = dateRange === '1year' ? 12 : dateRange === '6months' ? 6 : 3;
    
    const pipeline = [
        { $match: matchCriteria },
        ...(Object.keys(groupMatchCriteria).length > 0 ? [{ $match: groupMatchCriteria }] : []),
        {
            $group: {
                _id: { $substr: ['$date', 0, 7] }, // Group by YYYY-MM
                tours: { $sum: 1 },
                participants: {
                    $sum: {
                        $reduce: {
                            input: '$groups',
                            initialValue: 0,
                            in: {
                                $add: [
                                    '$$value',
                                    { $add: [
                                        { $ifNull: ['$$this.counts.regular', 0] },
                                        { $ifNull: ['$$this.counts.seniorSoldier', 0] },
                                        { $ifNull: ['$$this.counts.child', 0] }
                                    ]}
                                ]
                            }
                        }
                    }
                }
            }
        },
        { $sort: { _id: 1 } },
        { $limit: months }
    ];

    const result = await Tour.aggregate(pipeline);
    
    return result.map(item => ({
        month: item._id,
        tours: item.tours,
        participants: item.participants
    }));
}

/**
 * Get group type distribution
 */
async function getGroupTypeDistribution(matchCriteria, groupMatchCriteria) {
    const pipeline = [
        { $match: matchCriteria },
        { $unwind: '$groups' },
        ...(Object.keys(groupMatchCriteria).length > 0 ? [{ $match: groupMatchCriteria }] : []),
        {
            $group: {
                _id: '$groups.type',
                value: { $sum: 1 }
            }
        },
        { $sort: { value: -1 } }
    ];

    const result = await Tour.aggregate(pipeline);
    
    return result.map(item => ({
        name: item._id || 'Unknown',
        value: item.value
    }));
}

/**
 * Get geographic distribution
 */
async function getGeographicDistribution(matchCriteria, groupMatchCriteria) {
    const pipeline = [
        { $match: matchCriteria },
        { $unwind: '$groups' },
        ...(Object.keys(groupMatchCriteria).length > 0 ? [{ $match: groupMatchCriteria }] : []),
        {
            $group: {
                _id: '$groups.location.country',
                count: { $sum: 1 }
            }
        },
        { $sort: { count: -1 } },
        { $limit: 10 }
    ];

    const result = await Tour.aggregate(pipeline);
    
    return result.map(item => ({
        country: item._id || 'Unknown',
        count: item.count
    }));
}

/**
 * Get financial statistics
 */
async function getFinancialStatistics(matchCriteria, groupMatchCriteria) {
    const paymentStatusPipeline = [
        { $match: matchCriteria },
        { $unwind: '$groups' },
        ...(Object.keys(groupMatchCriteria).length > 0 ? [{ $match: groupMatchCriteria }] : []),
        {
            $group: {
                _id: '$groups.postVisit.paymentStatus',
                value: { $sum: 1 }
            }
        }
    ];

    const revenueBreakdownPipeline = [
        { $match: matchCriteria },
        { $unwind: '$groups' },
        ...(Object.keys(groupMatchCriteria).length > 0 ? [{ $match: groupMatchCriteria }] : []),
        {
            $group: {
                _id: null,
                tourFees: { $sum: '$groups.booking.totalCost' },
                donations: { $sum: '$groups.postVisit.donation.amount' }
            }
        }
    ];

    const [paymentStatusResult, revenueResult] = await Promise.all([
        Tour.aggregate(paymentStatusPipeline),
        Tour.aggregate(revenueBreakdownPipeline)
    ]);

    const paymentStatus = paymentStatusResult.map(item => ({
        name: item._id || 'Unknown',
        value: item.value
    }));

    const revenue = revenueResult[0] || { tourFees: 0, donations: 0 };
    const revenueBreakdown = [
        { category: 'Tour Fees', amount: revenue.tourFees },
        { category: 'Donations', amount: revenue.donations }
    ];

    return {
        paymentStatus,
        revenueBreakdown
    };
}

/**
 * Get engagement statistics
 */
async function getEngagementStatistics(matchCriteria, groupMatchCriteria) {
    const pipeline = [
        { $match: matchCriteria },
        { $unwind: '$groups' },
        ...(Object.keys(groupMatchCriteria).length > 0 ? [{ $match: groupMatchCriteria }] : []),
        {
            $group: {
                _id: null,
                totalGroups: { $sum: 1 },
                storeVisits: {
                    $sum: { $cond: [{ $eq: ['$groups.engagement.storeVisit', true] }, 1, 0] }
                },
                tekheletPurchases: {
                    $sum: { $cond: [{ $gt: [{ $size: { $ifNull: ['$groups.engagement.tekheletItems', []] } }, 0] }, 1, 0] }
                },
                otherPurchases: {
                    $sum: { $cond: [{ $gt: [{ $size: { $ifNull: ['$groups.engagement.otherItems', []] } }, 0] }, 1, 0] }
                },
                reviewsReceived: {
                    $sum: { $cond: [{ $eq: ['$groups.postVisit.reviewReceived', true] }, 1, 0] }
                },
                newsletterOptins: {
                    $sum: { $cond: [{ $eq: ['$groups.postVisit.newsletterOptIn', true] }, 1, 0] }
                },
                ambassadors: {
                    $sum: { $cond: [{ $eq: ['$groups.postVisit.ambassador', true] }, 1, 0] }
                }
            }
        }
    ];

    const result = await Tour.aggregate(pipeline);
    const stats = result[0] || {
        totalGroups: 0,
        storeVisits: 0,
        tekheletPurchases: 0,
        otherPurchases: 0,
        reviewsReceived: 0,
        newsletterOptins: 0,
        ambassadors: 0
    };

    // Calculate percentages
    const total = stats.totalGroups || 1; // Avoid division by zero
    
    return {
        storeVisitRate: Math.round((stats.storeVisits / total) * 100),
        tekheletPurchaseRate: Math.round((stats.tekheletPurchases / total) * 100),
        otherPurchaseRate: Math.round((stats.otherPurchases / total) * 100),
        reviewCompletionRate: Math.round((stats.reviewsReceived / total) * 100),
        newsletterOptinRate: Math.round((stats.newsletterOptins / total) * 100),
        ambassadorRate: Math.round((stats.ambassadors / total) * 100)
    };
}
