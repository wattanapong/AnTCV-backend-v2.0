import { Request, Response } from "express"
import * as projectModel from '../models/projectModel'
import * as userModel from '../models/userModel'
import * as imageModel from '../models/imageModel'
import * as detectionModel from '../models/detectionModel'
import * as segmentationModel from '../models/segmentationModel'
const AdmZip = require('adm-zip')
import * as mapClassId from '../utils/mapClassId'
const jwt = require('jsonwebtoken')
import { parse } from 'yaml';
import path from 'path';
import fs from 'fs';
import Jimp from 'jimp';
import sharp from 'sharp'
import fileType from 'file-type';
import sharpBmp from 'sharp-bmp'
const StreamZip = require('node-stream-zip');

export const YOLO_detection = async (req: Request, res: Response) => {

    const idproject = parseInt(req.body.idproject)
    const projectPath = path.join(process.cwd(), 'uploads', idproject.toString());
    var num_imgs = 0;
    var annotations = 0;
    var classes = 0;
    try {
        const token = req.cookies.token
        const user = jwt.verify(token, process.env.SECRET as string)
        const file = req.file
        
        const detectionImages = await detectionModel.countDetection(idproject)

        if (detectionImages.images != 0 || detectionImages.classes != 0) {
            return res.status(200).json({
                type: 'failed',
                message: 'Upload incompleted, please delete existing images and classes',
            })
        }

        fs.mkdirSync(projectPath, { recursive: true });

        // const zip = new AdmZip(file?.path!);
        // zip.extractAllTo(projectPath, true);

        const zip = new StreamZip.async({ file: file?.path! });
        await zip.extract(null, projectPath);
        await zip.close();

        fs.unlinkSync(file?.path!)

        const imagesDir = path.join(projectPath, 'images');
        const labelsDir = path.join(projectPath, 'labels');

        const labels: { index: number, label: string, projectId: number }[] = [];
        const detections: any[] = [];

        let img = path.join(__dirname, '../project_path', idproject.toString(), 'images')

        const imageFiles = fs.readdirSync(imagesDir);
        const storagePath = path.join(__dirname, '../project_path', idproject.toString(), 'images');
        let thumbsPath = path.join(__dirname, '../project_path', idproject.toString(), 'thumbs')

        for (const imageFile of imageFiles) {
            const newFilePath = path.join(storagePath, imageFile);
            let thumbsPath = path.join(__dirname, '../project_path', idproject.toString(), 'thumbs', imageFile)
            try {
                fs.copyFileSync(path.join(imagesDir, imageFile), newFilePath);
            } catch (err) {
                console.warn('can not extract ' + newFilePath);
                continue;
            }

            sharp(newFilePath).resize(200, 200).toFile(thumbsPath)

            await detectionModel.createDetection(imageFile, idproject)
            await segmentationModel.createSegmentation(imageFile, idproject)

        }

        const yamlPath = path.join(projectPath, 'data.yaml');
        if (fs.existsSync(yamlPath)) {
            const yamlContent = fs.readFileSync(yamlPath, 'utf-8');
            const parsedYaml = parse(yamlContent);

            if (parsedYaml.names && typeof parsedYaml.names === 'object') {
                Object.keys(parsedYaml.names).forEach((key: any) => {
                    const index = parseInt(key);
                    const label = parsedYaml.names[key];
                    labels.push({ index, label, projectId: idproject });
                });
            } else {
                return res.status(400).json({ error: 'Invalid YAML structure: names field is missing or not an object' });
            }
        } else {
            return res.status(400).json({ error: 'data.yaml file not found' });
        }
        for (const label of labels) {
            await detectionModel.createClass(label.label, idproject);
            await segmentationModel.createClass(label.label, idproject);
        }
        const labelFiles = fs.readdirSync(labelsDir);

        for (const labelFile of labelFiles) {
            const filePath = path.join(labelsDir, labelFile);
            let content;
            try {
                content = fs.readFileSync(filePath, 'utf-8');
            } catch (err) {
                console.warn(err + ' ' + filePath);
                continue;
            }

            const baseName = path.basename(labelFile, '.txt');
            // const ext = path.extname(baseName)
            const fileTypes = ['.jpg','.png','.JPG','.PNG','.jpeg','.JPEG']
            var imageFileName = '';

            for (let fi = 0; fi < fileTypes.length; fi++) {
                const element = fileTypes[fi];
                imageFileName = `${baseName}${element}`;
                if (fs.existsSync(path.join(imagesDir, `${imageFileName}`))) {
                    break;
                }
            }

            if (imageFileName != ''){
                num_imgs++;

                const lines = content.split('\n');
                for (const line of lines) {
                    if (line.trim()) {
                        const [classId, x_center, y_center, width, height] = line.split(' ');
                        const imgPath = path.join(imagesDir, imageFileName)
                        const metadata = await sharp(imgPath).metadata();
                        const image_width = metadata.width;
                        const image_height = metadata.height;

                        annotations++;

                        detections.push({
                            classId: await mapClassId.map_detection_import(parseInt(classId), labels, idproject),
                            x1: ((parseFloat(x_center) * image_width!) - ((parseFloat(width) * image_width!) / 2)) / image_width!,
                            y1: ((parseFloat(y_center) * image_height!) - ((parseFloat(height) * image_height!) / 2)) / image_height!,
                            x2: ((parseFloat(x_center) * image_width!) + ((parseFloat(width) * image_width!) / 2)) / image_width!,
                            y2: ((parseFloat(y_center) * image_height!) + ((parseFloat(height) * image_height!) / 2)) / image_height!,
                            user_id: user.id,
                            image_path: imageFileName,
                            idproject: idproject
                        });
                    }
                }
            }
        }

        if (fs.existsSync(projectPath)) {
            fs.readdirSync(imagesDir).forEach((file) => {
                const filePath = path.join(imagesDir, file);
                try {
                    fs.unlinkSync(filePath);
                } catch (err) {
                    console.warn(err + ' ' + filePath)
                }
            })
            fs.readdirSync(labelsDir).forEach((file) => {
                const filePath = path.join(labelsDir, file);
                try {
                    fs.unlinkSync(filePath);
                } catch (err) {
                    console.warn(err + ' ' + filePath)
                }
            })
            try {
                fs.rmdirSync(imagesDir);
            } catch (err) {
                console.warn(err + ' ' + imagesDir)
            }
            try {
                fs.rmdirSync(labelsDir);
            } catch (err) {
                console.warn(err + ' ' + labelsDir)
            }
            fs.readdirSync(projectPath).forEach((file) => {
                const filePath = path.join(projectPath, file);
                try {
                    fs.unlinkSync(filePath);
                } catch (err) {
                    console.warn(err + ' ' + filePath)
                }
            })
            try {
                fs.rmdirSync(projectPath);
            } catch (err) {
                console.warn(err + ' ' + projectPath)
            }
        }
        const save_bbox = await detectionModel.create_import_Bounding_box(detections, user.id, idproject)

        return res.status(200).json({
            type: 'success',
            message: `Upload successful, ${num_imgs} images uploaded and ${annotations} annotations created.`,
            num_imgs: num_imgs
        })

    } catch (error) {
        console.error('error:', error);
        return res.status(400).json({ error: 'upload YOLO detection ERROR!!', num_imgs: num_imgs })
    } finally{
        if (fs.existsSync(projectPath)) {
            fs.rmSync(projectPath, { recursive: true, force: true });
        }
    }
}

export const YOLO_segmentation = async (req: Request, res: Response) => {
    try {
        const token = req.cookies.token
        const user = jwt.verify(token, process.env.SECRET as string)
        const file = req.file
        const idproject = parseInt(req.body.idproject)

        const checkData = await segmentationModel.getAllSegmentation(idproject)

        if (checkData.length != 0) {
            return res.status(200).json({
                type: 'failed',
                message: 'Not allowed to import',
            })
        }

        const projectPath = path.join(process.cwd(), 'uploads', idproject.toString());

        if (!fs.existsSync(projectPath)) {
            fs.mkdirSync(projectPath, { recursive: true });
        }

        //const zip = new AdmZip(file?.path!);
        //zip.extractAllTo(projectPath, true);

        const zip = new StreamZip.async({ file: file?.path! });
        await zip.extract(null, projectPath);
        await zip.close();

        fs.unlinkSync(file?.path!)

        const imagesDir = path.join(projectPath, 'images');
        const labelsDir = path.join(projectPath, 'labels');

        const labels: { index: number, label: string, projectId: number }[] = [];
        const segmentations: any[] = [];
        const detections: any[] = []

        let img = path.join(__dirname, '../project_path', idproject.toString(), 'images')

        const imageFiles = fs.readdirSync(imagesDir);
        const storagePath = path.join(__dirname, '../project_path', idproject.toString(), 'images');
        let thumbsPath = path.join(__dirname, '../project_path', idproject.toString(), 'thumbs')


        for (const imageFile of imageFiles) {
            const newFilePath = path.join(storagePath, imageFile);
            // console.log("newFilePath : ", newFilePath)
            let thumbsPath = path.join(__dirname, '../project_path', idproject.toString(), 'thumbs', imageFile)
            try {
                fs.copyFileSync(path.join(imagesDir, imageFile), newFilePath);
            } catch (err) {
                console.warn('can not extract ' + newFilePath);
                continue;
            }
            sharp(newFilePath).resize(200, 200).toFile(thumbsPath)

            await segmentationModel.createSegmentation(imageFile, idproject)
            await detectionModel.createDetection(imageFile, idproject)

        }

        const yamlPath = path.join(projectPath, 'data.yaml');
        if (fs.existsSync(yamlPath)) {
            const yamlContent = fs.readFileSync(yamlPath, 'utf-8');
            const parsedYaml = parse(yamlContent);

            if (parsedYaml.names && typeof parsedYaml.names === 'object') {
                Object.keys(parsedYaml.names).forEach((key: any) => {
                    const index = parseInt(key);
                    const label = parsedYaml.names[key];
                    labels.push({ index, label, projectId: idproject });
                });
            } else {
                return res.status(400).json({ error: 'Invalid YAML structure: names field is missing or not an object' });
            }
        } else {
            return res.status(400).json({ error: 'data.yaml file not found' });
        }
        for (const label of labels) {
            await segmentationModel.createClass(label.label, idproject);
            await detectionModel.createClass(label.label, idproject)
        }
        const AlllabelFiles = fs.readdirSync(labelsDir);
        const labelFiles = AlllabelFiles.filter(file => path.extname(file) === '.txt');

        for (const labelFile of labelFiles) {

            const filePath = path.join(labelsDir, labelFile);
            let content;
            try {
                content = fs.readFileSync(filePath, 'utf-8');
            } catch (err) {
                console.warn(err + ' ' + filePath);
                continue;
            }

            const lines = content.split('\n');
            for (const line of lines) {
                if (line.trim()) {
                    const values = line.split(' ')
                    const classId = values[0]
                    const x = values.shift()
                    const coordinates = line.split(' ').map(Number)
                    const y = coordinates.shift()
                    const xCoords = coordinates.filter((_, index) => index % 2 === 0);
                    const yCoords = coordinates.filter((_, index) => index % 2 !== 0);
                    const xMin = Math.min(...xCoords);
                    const yMin = Math.min(...yCoords);
                    const xMax = Math.max(...xCoords);
                    const yMax = Math.max(...yCoords);
                    console.log('ClassID : ', classId)
                    const polygons: string[] = []
                    for (let i = 0; i < values.length; i += 2) {
                        const polygon = `${values[i]},${values[i + 1]}`
                        polygons.push(polygon)
                    }
                    const xy_polygon = polygons.join(' ')
                    const baseName = path.basename(labelFile, '.txt');

                    let imageFileName = `${baseName}.jpg`;

                    if (fs.existsSync(path.join(imagesDir, `${baseName}.png`))) {
                        imageFileName = `${baseName}.png`;
                    }
                    const imgPath = path.join(imagesDir, imageFileName)
                    const metadata = await sharp(imgPath).metadata();
                    // console.log(labels)
                    segmentations.push({
                        classId: await mapClassId.map_segmentation_import(classId, labels, idproject),
                        xy_polygon: xy_polygon,
                        user_id: user.id,
                        image_path: imageFileName,
                        idproject: idproject
                    });

                    detections.push({
                        classId: await mapClassId.map_detection_import(parseInt(classId), labels, idproject),
                        x1: xMin,
                        y1: yMin,
                        x2: xMax,
                        y2: yMax,
                        user_id: user.id,
                        image_path: imageFileName,
                        idproject: idproject
                    });
                }
            }
        }


        if (fs.existsSync(projectPath)) {
            fs.readdirSync(imagesDir).forEach((file) => {
                const filePath = path.join(imagesDir, file);
                try {
                    fs.unlinkSync(filePath);
                } catch (err) {
                    console.warn(err + ' ' + filePath)
                }
            })
            fs.readdirSync(labelsDir).forEach((file) => {
                const filePath = path.join(labelsDir, file);
                try {
                    fs.unlinkSync(filePath);
                } catch (err) {
                    console.warn(err + ' ' + filePath)
                }
            })
            try {
                fs.rmdirSync(imagesDir);
            } catch (err) {
                console.warn(err + ' ' + imagesDir)
            }
            try {
                fs.rmdirSync(labelsDir);
            } catch (err) {
                console.warn(err + ' ' + labelsDir)
            }
            fs.readdirSync(projectPath).forEach((file) => {
                const filePath = path.join(projectPath, file);
                try {
                    fs.unlinkSync(filePath);
                } catch (err) {
                    console.warn(err + ' ' + filePath)
                }
            })
            try {
                fs.rmdirSync(projectPath);
            } catch (err) {
                console.warn(err + ' ' + projectPath)
            }
        }
        const save_polygon = await segmentationModel.create_import_Polygon(segmentations, user.id, idproject)
        const save_bbox = await detectionModel.create_import_Bounding_box(detections, user.id, idproject)

        return res.status(200).json({
            type: 'success',
            message: 'import polygon success',
        })


    } catch (error) {
        console.error('error:', error);
        return res.status(400).json({ error: 'upload YOLO segmentation ERROR!!' })
    }
}
