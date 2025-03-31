import express from 'express'
import cors from 'cors'
import userRoutes from './routes/userRoute'
import projectRoutes from './routes/projectRoute'
import detectionRoutes from './routes/detectionRoute'
import segmentationRoutes from './routes/segmentationRoute'
import exportfile from './routes/exportfile'
import importDataset from './routes/importDataset'
import classificationRoute from './routes/classificationRoute'
import session from 'express-session'
import dotenv from 'dotenv'
import path from "path";
const cookie = require('cookie-parser')

dotenv.config()
const app = express()

app.use(session({
  secret: '123456789',
  resave: false,
  saveUninitialized: true
}));

app.use('/img', express.static('project_path'))
app.use(cors({ origin: `${process.env.ORIGIN_URL}`, credentials: true}))
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(cookie())
app.use(userRoutes, projectRoutes, detectionRoutes, segmentationRoutes, exportfile
        ,importDataset, classificationRoute
)

import util from 'util';

const exec = util.promisify(require('child_process').exec);

const du = async (path: string) => {
    const { stdout, stderr } = await exec('du -sh ' + path);
    if (!stderr){
	console.log('stdout:', stdout);
	let sz = stdout.split('\t');
	sz[1] = sz[1].replace('\n', "");
        return sz;
    }else {
        console.log('stderr:', stderr);
    }
}

app.get('/', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'welcome.html'))
})


app.get('/du', async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    let sz = await du("/home/antcv/bantcv/project_path/.")
    res.send(JSON.stringify({ [sz[1]] : sz[0] }) )
    res.end()
})



app.listen(5000, () => {
    console.log('Server is running on port 5000')
})
