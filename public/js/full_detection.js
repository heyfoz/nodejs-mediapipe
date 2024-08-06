/*
 * Copyright 2024 Forrest Moulin
 *
 * Portions of this code are based on MediaPipe code:
 * Copyright 2023 The MediaPipe Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * full_detection.js
 */

// Import required vision module from MediaPipe using CDN
import vision from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3";

// Extract required classes from vision module
const { FaceLandmarker, FilesetResolver, DrawingUtils, GestureRecognizer, PoseLandmarker } = vision;

// Get elements from the DOM
const video = document.getElementById("webcam");
const enableWebcamButton = document.getElementById("webcamButton");
const canvasElement = document.getElementById("output_canvas");
const canvasCtx = canvasElement ? canvasElement.getContext("2d") : null; // Ensure canvasCtx is not null
const drawingUtils = canvasCtx ? new DrawingUtils(canvasCtx) : null; // Initialize DrawingUtils only if canvasCtx is not null
const cyanColor = "#22dee5";
const purpleColor = "#7696eb";
const delegateType = "CPU";
let handGestureRunning = false;

const customLandmarkConnections = [
    [11, 12], [11, 13], [12, 14], [13, 15], [14, 16], 
    [11, 23], [12, 24], [23, 25], [24, 26], [25, 27],
    [26, 28], [27, 29], [28, 30], [29, 31], [30, 32]
];

const poseLandmarksToDraw = new Set([
    11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32
]);

// Initialize Landmarker variables
let gestureRecognizer, faceLandmarker, poseLandmarker;
let runningMode = "VIDEO";
let webcamRunning = false;
let stream; // Store the webcam stream

// Custom function to draw a line between two points
function drawLine(ctx, point1, point2, color, lineWidth) {
    ctx.beginPath();
    ctx.moveTo(point1.x * ctx.canvas.width, point1.y * ctx.canvas.height);
    ctx.lineTo(point2.x * ctx.canvas.width, point2.y * ctx.canvas.height);
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
}

// Helper function for linear interpolation
function lerp(value, min, max, newMin, newMax) {
    return ((value - min) / (max - min)) * (newMax - newMin) + newMin;
}

// Ensure radius is always positive and smaller
function getRadius(data) {
    const radius = lerp(data.from.z, -0.15, 0.1, 2, 10); // Adjust multiplier for smaller size
    return Math.max(radius, 2); // Ensure radius is at least 2
}

// Create and configure the GestureRecognizer
async function createGestureRecognizer() {
    const filesetResolver = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
    );
    gestureRecognizer = await GestureRecognizer.createFromOptions(filesetResolver, {
        baseOptions: {
            modelAssetPath: "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task",
            delegate: delegateType
        },
        runningMode: runningMode,
        numHands: 2
    });
}

// Create and configure the FaceLandmarker
async function createFaceLandmarker() {
    const filesetResolver = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
    );
    faceLandmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
        baseOptions: {
            modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
            delegate: delegateType
        },
        outputFaceBlendshapes: true,
        runningMode: runningMode,
        numFaces: 1
    });
}

// Create and configure the PoseLandmarker
async function createPoseLandmarker() {
    const filesetResolver = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
    );
    poseLandmarker = await PoseLandmarker.createFromOptions(filesetResolver, {
        baseOptions: {
            modelAssetPath: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
            delegate: delegateType
        },
        runningMode: runningMode,
        numPoses: 1
    });
}

// Load models
async function initializeModels() {
    await createGestureRecognizer();
    await createFaceLandmarker();
    await createPoseLandmarker();
}

// Check if webcam access is supported
const hasGetUserMedia = () => !!navigator.mediaDevices?.getUserMedia;

if (hasGetUserMedia()) {
    enableWebcamButton.addEventListener("click", enableCam);
} else {
    console.warn("getUserMedia() is not supported by your browser");
}

// Enable or disable webcam and all detections
function enableCam() {
    if (!faceLandmarker || !gestureRecognizer || !poseLandmarker) {
        console.log("Wait! Models not loaded yet.");
        return;
    }

    webcamRunning = !webcamRunning;
    enableWebcamButton.innerText = webcamRunning ? "DISABLE DETECTION" : "ENABLE DETECTION";

    const constraints = {
        video: { width: 1280, height: 720 }
    };

    if (webcamRunning) {
        navigator.mediaDevices.getUserMedia(constraints).then((stream) => {
            video.srcObject = stream;
            video.addEventListener("loadeddata", predictWebcam);
        });
    } else {
        const stream = video.srcObject;
        if (stream) {
            const tracks = stream.getTracks();
            tracks.forEach(track => track.stop());
            video.srcObject = null;
        }
        canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    }
}

// Update canvas size to match video dimensions
function updateCanvasSize() {
    const videoRatio = video.videoHeight / video.videoWidth;
    video.style.width = '100%';
    video.style.height = 'auto';
    canvasElement.style.width = '100%';
    canvasElement.style.height = 'auto';
    canvasElement.width = video.videoWidth;
    canvasElement.height = video.videoHeight;
}

// Predict and draw landmarks for face, pose, and hand
async function predictWebcam() {

    const gestureOutput = document.getElementById("gesture_output");
    const confidenceOutput = document.getElementById("confidence_output");
    const handednessOutput = document.getElementById("handedness_output");
    const faceOutput = document.getElementById("face_output");
    const handCountOutput = document.getElementById("hand_count_output");
    updateCanvasSize();

    if (webcamRunning) {
        const startTimeMs = performance.now();
        const faceResults = await faceLandmarker.detectForVideo(video, startTimeMs);
        const poseResults = await poseLandmarker.detectForVideo(video, startTimeMs);
        const nowInMs = Date.now();
        const handResults = await gestureRecognizer.recognizeForVideo(video, nowInMs);

        canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);

        // Draw face landmarks
        if (faceResults.faceLandmarks) {
            for (const landmarks of faceResults.faceLandmarks) {
                drawingUtils.drawConnectors(
                    landmarks,
                    FaceLandmarker.FACE_LANDMARKS_TESSELATION,
                    { color: "#C0C0C070", lineWidth: 1 }
                );
                drawingUtils.drawConnectors(
                    landmarks,
                    FaceLandmarker.FACE_LANDMARKS_RIGHT_EYEBROW,
                    { color: "#83f47e" }
                );
                drawingUtils.drawConnectors(
                    landmarks,
                    FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE,
                    { color: "#83f47e" }
                );
                drawingUtils.drawConnectors(
                    landmarks,
                    FaceLandmarker.FACE_LANDMARKS_RIGHT_IRIS,
                    { color: "#83f47e" }
                );
                drawingUtils.drawConnectors(
                    landmarks,
                    FaceLandmarker.FACE_LANDMARKS_LEFT_EYEBROW,
                    { color: "#83f47e" }
                );
                drawingUtils.drawConnectors(
                    landmarks,
                    FaceLandmarker.FACE_LANDMARKS_LEFT_EYE,
                    { color: "#83f47e" }
                );
                drawingUtils.drawConnectors(
                    landmarks,
                    FaceLandmarker.FACE_LANDMARKS_LEFT_IRIS,
                    { color: "#83f47e" }
                );
                drawingUtils.drawConnectors(
                    landmarks,
                    FaceLandmarker.FACE_LANDMARKS_FACE_OVAL,
                    { color: "#E0E0E0" }
                );
                drawingUtils.drawConnectors(
                    landmarks,
                    FaceLandmarker.FACE_LANDMARKS_LIPS,
                    { color: "#E0E0E0" }
                );
            }
        }
        

        // Draw custom pose landmarks and connectors
        if (poseResults.landmarks && Array.isArray(poseResults.landmarks)) {
            for (const landmarksArray of poseResults.landmarks) {
                if (Array.isArray(landmarksArray) && landmarksArray.length > 0) {
                    // Draw specific landmarks
                    const specificLandmarks = landmarksArray.filter(
                        (_, index) => poseLandmarksToDraw.has(index)
                    );

                    drawingUtils.drawLandmarks(specificLandmarks, {
                        radius: 10,
                        // radius: (data) => getRadius(data), // Use updated radius function
                        color: cyanColor // Set landmark color
                    });

                    // Draw custom connectors
                    customLandmarkConnections.forEach(([start, end]) => {
                        if (landmarksArray[start] && landmarksArray[end]) {
                            drawLine(canvasCtx, landmarksArray[start], landmarksArray[end], purpleColor, 3);
                        }
                    });
                } else {
                    console.error("landmarksArray is not a valid array:", landmarksArray);
                }
            }
        } else {
            console.error("poseResults.landmarks is not a valid array:", poseResults.landmarks);
        }

        // Draw hand landmarks and recognize gestures
        if (handResults.landmarks) {
            for (let landmarks of handResults.landmarks) {
                drawingUtils.drawConnectors(
                    landmarks,
                    GestureRecognizer.HAND_CONNECTIONS,
                    { color: purpleColor, lineWidth: 5 }
                );
                drawingUtils.drawLandmarks(landmarks, {
                    color: cyanColor,
                    lineWidth: 2
                });
            }
        }

        if (handGestureRunning) {
            const nowInMs = Date.now();
            const handResults = await gestureRecognizer.recognizeForVideo(video, nowInMs);
    
            canvasCtx.save();
    
            if (handResults.landmarks.length > 0) {
              const drawingUtils = new DrawingUtils(canvasCtx);
              let handIndex = 0;
              for (const landmarks of handResults.landmarks) {
                drawingUtils.drawConnectors(
                  landmarks,
                  GestureRecognizer.HAND_CONNECTIONS,
                  { color: "#7696eb", lineWidth: 5 } // Landmark connection lines (default 00FF00)
                );
                // 21 landmark points
                drawingUtils.drawLandmarks(landmarks, { color: "#22dee5", lineWidth: 2 }); // #FF0000
    
                const gestures = handResults.gestures[handIndex];
                const handedness = handResults.handednesses[handIndex];
                if (gestures && gestures.length > 0) {
                    //gestureOutput.innerText = gesture_name_map[gestureName] || "Unknown Gesture";
                    // gestureOutput.innerText = gestureNameMap[gestureName] || "Unknown Gesture";
                    //gestureOutput.innerText = `${gestures[0].categoryName}`;
                  const gestureName = gestures[0].categoryName;
                  gestureOutput.innerText = gestureName || "Unknown Gesture";
                  confidenceOutput.innerText = `${(gestures[0].score * 100).toFixed(2)}%`;
                  handednessOutput.innerText = `${handedness[0].categoryName}`;
                  //sendGestureToServer(gestureName); // Send gesture to server
                } else {
                  gestureOutput.innerText = "Not Detected";
                  confidenceOutput.innerText = "100%";
                  handednessOutput.innerText = "Not Detected";
                }
                handIndex++;
              }
            } else {
              gestureOutput.innerText = "Not Detected";
              confidenceOutput.innerText = "100%";
              handednessOutput.innerText = "Not Detected";
            }
    
            handCountOutput.innerText = `${handResults.landmarks.length}`;
    
            canvasCtx.restore();
        }

        requestAnimationFrame(predictWebcam);
    }
}
// Initialize models and load everything
initializeModels();