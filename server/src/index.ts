import cors from 'cors'
import express from 'express';
import axios from 'axios';

const SERVER_PORT = process.env.SERVER_PORT || '8001'
const URL_PREFIX = process.env.URL_PREFIX || ''

const app = express()

app.use(cors())
app.use(express.json())

// Create a router for an URL prefix
const router = express.Router()
app.use(URL_PREFIX, router)


router.get('/:network/listUnspent/:addr', async (req, res) => {
    const { network, addr } = req.params;
    try {
        const response = await axios.get(`https://api.whatsonchain.com/v1/bsv/${network}/address/${addr}/unspent`);
        
        if (response.data) {
            res.json(response.data);
        } else {
            res.status(500).json({ error: "Unable to fetch data." });
        }
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch data from WhatsOnChain API." });
    }
});

app.listen(SERVER_PORT, () =>
    console.log(`🚀 Server ready at: http://localhost:${SERVER_PORT}`)
)

