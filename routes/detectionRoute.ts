import express, { Request, Response } from 'express';
import * as detectionController from '../controller/detectionController'
import * as check from '../middleware/auth'
const router = express.Router()

router.post('/create/detection/label', check.checkAuth, detectionController.createDetectionClass)
router.post('/create/detection/bounding_box', check.checkAuth, detectionController.CRUDBounding_box)
router.post('/convert/detection', check.checkAuth, detectionController.detection_to_classification)

router.get('/detection/class/:idproject', check.checkAuth, detectionController.getAllClass)
router.get('/detection/bounding_box/:iddetection', check.checkAuth, detectionController.getBounding_box)
router.get('/detection/allDetection/:idproject', check.checkAuth, detectionController.getAllDetection)
router.get('/detection/getProcess/:idproject', check.checkAuth, detectionController.get_process)

router.get('/detection/count/:idproject', check.checkAuth, detectionController.count_images)

router.put('/update/detection/class', check.checkAuth, detectionController.updateClass)

router.delete('/delete/detection/bounding_box', check.checkAuth, detectionController.delBounding_box)
router.delete('/delete/detection/class', check.checkAuth, detectionController.delLabel)

export default router