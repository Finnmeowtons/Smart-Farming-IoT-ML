const pool = require("../connection");
const express = require('express');
const router = express.Router();


class AnalyticController {
    static async rawData(req, res) {
        const { page = 1, limit = 50, device } = req.query;
        const offset = (page - 1) * limit;

        try {
            let dataQuery = 'SELECT * FROM data';
            let countQuery = 'SELECT COUNT(*) as total FROM data';
            const queryParams = [];

            if (device && device != '0') {
                dataQuery += ' WHERE device_id = ?';
                countQuery += ' WHERE device_id = ?';
                queryParams.push(device);
            }

            dataQuery += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
            queryParams.push(parseInt(limit), parseInt(offset));

            const [rows] = await pool.query(dataQuery, queryParams);
            const [[{ total }]] = await pool.query(countQuery, device ? [device] : []);

            res.json({
                total,
                data: rows,
            });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    }


    // 2️⃣ Aggregated analytics
    static async aggregatedData(req, res) {
        const { hours, days, device } = req.query;
    
        let intervalCondition = 'timestamp >= NOW() - INTERVAL 1 DAY';
        if (hours) {
            intervalCondition = `timestamp >= NOW() - INTERVAL ${parseInt(hours)} HOUR`;
        } else if (days) {
            intervalCondition = `timestamp >= NOW() - INTERVAL ${parseInt(days)} DAY`;
        }
    
        // Add device_id condition if provided
        let deviceCondition = '';
        const params = [];
    
        if (device) {
            deviceCondition = ' AND device_id = ?';
            params.push(device);
        }
    
        try {
            const [rows] = await pool.execute(`
                SELECT 
                    window_start,
                    ROUND(AVG(temperature), 2) AS avg_temperature,
                    ROUND(AVG(humidity), 2) AS avg_humidity,
                    ROUND(AVG(soil_moisture_raw), 2) AS avg_soil_moisture_raw,
                    ROUND(AVG(soil_moisture_percentage), 2) AS avg_soil_moisture_percentage,
                    ROUND(AVG(soil_temperature), 2) AS avg_soil_temperature,
                    ROUND(AVG(soil_ph), 2) AS avg_soil_ph,
                    ROUND(AVG(nitrogen), 2) AS avg_nitrogen,
                    ROUND(AVG(phosphorus), 2) AS avg_phosphorus,
                    ROUND(AVG(potassium), 2) AS avg_potassium
                FROM (
                    SELECT 
                        FROM_UNIXTIME(UNIX_TIMESTAMP(timestamp) - MOD(UNIX_TIMESTAMP(timestamp), 600)) AS window_start,
                        temperature,
                        humidity,
                        soil_moisture_raw,
                        soil_moisture_percentage,
                        soil_temperature,
                        soil_ph,
                        nitrogen,
                        phosphorus,
                        potassium
                    FROM data
                    WHERE ${intervalCondition}${deviceCondition}
                ) AS subquery
                GROUP BY window_start
                ORDER BY window_start ASC
            `, params);
    
            res.json(rows);
        } catch (err) {
            console.error('Aggregation error:', err);
            res.status(500).send('Server Error');
        }
    }
    
}


module.exports = AnalyticController;
