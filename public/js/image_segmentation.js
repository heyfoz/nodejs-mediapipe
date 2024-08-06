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
 * image_segmentation.js
 */
// Import required classes from MediaPipe using CDN
import { ImageSegmenter, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.2";

document.addEventListener("DOMContentLoaded", () => {
    const video = document.getElementById("webcam");
    const canvasElement = document.getElementById("canvas");
    const canvasCtx = canvasElement.getContext("2d");
    const maskedCanvas = document.getElementById("maskedCanvas");
    const maskedCtx = maskedCanvas.getContext("2d");
    const enableWebcamButton = document.getElementById("webcamButton");
    let webcamRunning = false;
    let imageSegmenter;
    let stream; // Store the webcam stream

    const createImageSegmenter = async () => {
        const audio = await FilesetResolver.forVisionTasks(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.2/wasm"
        );

        imageSegmenter = await ImageSegmenter.createFromOptions(audio, {
            baseOptions: {
                //modelAssetPath: "selfie_segmenter_landscape.tflite",
                modelAssetPath: "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite", // Path to your SelfieMulticlass model
                delegate: "GPU"
            },
            runningMode: "VIDEO",
            outputCategoryMask: true,
            outputConfidenceMasks: false
        });
    };

    const callbackForVideo = (result) => {
        const videoWidth = video.videoWidth;
        const videoHeight = video.videoHeight;

        // Ensure canvas dimensions match video dimensions
        canvasElement.width = videoWidth;
        canvasElement.height = videoHeight;
        maskedCanvas.width = videoWidth;
        maskedCanvas.height = videoHeight;

        // Clear the canvases
        canvasCtx.clearRect(0, 0, videoWidth, videoHeight);
        maskedCtx.clearRect(0, 0, videoWidth, videoHeight);

        // Draw the video frame on the canvas
        canvasCtx.drawImage(video, 0, 0, videoWidth, videoHeight);

        // Create a new image data object for the masked canvas
        const imageData = canvasCtx.getImageData(0, 0, videoWidth, videoHeight);
        const mask = result.categoryMask.getAsUint8Array();
        const data = imageData.data;

        // Apply the mask to the image data
        for (let i = 0; i < mask.length; i++) {
            const maskIndex = i * 4;

            if (mask[i] !== 0) {
                const x = i % videoWidth;
                const y = Math.floor(i / videoWidth);
                const pixelIndex = (y * videoWidth + x) * 4;

                // Copy the video frame's pixel to the masked canvas
                const videoPixelData = canvasCtx.getImageData(x, y, 1, 1).data;
                data[pixelIndex] = videoPixelData[0];   // Red
                data[pixelIndex + 1] = videoPixelData[1]; // Green
                data[pixelIndex + 2] = videoPixelData[2]; // Blue
                data[pixelIndex + 3] = 255; // Fully opaque
            } else {
                // Set background to transparent
                data[maskIndex] = 0;     // Red
                data[maskIndex + 1] = 0; // Green
                data[maskIndex + 2] = 0; // Blue
                data[maskIndex + 3] = 0; // Alpha (transparent)
            }
        }

        // Put updated image data to the masked canvas
        maskedCtx.putImageData(imageData, 0, 0);

        if (webcamRunning) {
            window.requestAnimationFrame(predictWebcam);
        }
    };

    const predictWebcam = async () => {
        canvasCtx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
        if (imageSegmenter) {
            const startTimeMs = performance.now();
            imageSegmenter.segmentForVideo(video, startTimeMs, callbackForVideo);
        }
    };

    const enableCam = async () => {
        if (imageSegmenter === undefined) {
            return;
        }

        if (webcamRunning) {
            webcamRunning = false;
            enableWebcamButton.innerText = "ENABLE SEGMENTATION";
            maskedCanvas.style.display = "none"; // Hide masked canvas
            document.querySelector('.masked-container').style.display = 'none'; // Hide masked canvas container
            document.querySelector('.video-container').style.display = 'none'; // Hide video container
            video.style.display = "none"; // Hide webcam

            // Stop the webcam stream
            if (stream) {
                stream.getTracks().forEach(track => track.stop());
                stream = null;
            }
        } else {
            webcamRunning = true;
            enableWebcamButton.innerText = "DISABLE SEGMENTATION";
            const constraints = {
                video: { width: 720, height: 360 }
            };  
            stream = await navigator.mediaDevices.getUserMedia(constraints);
            video.srcObject = stream;
            video.style.display = "block"; // Show webcam
            video.addEventListener("loadeddata", () => {
                predictWebcam();
                maskedCanvas.style.display = "block"; // Show masked canvas
                document.querySelector('.masked-container').style.display = 'block'; // Show masked canvas container
                document.querySelector('.video-container').style.display = 'block'; // Show video container
            });
        }
    };

    // Check if elements exist before adding event listeners
    if (enableWebcamButton) {
        enableWebcamButton.addEventListener("click", enableCam);
    }

    // Initialize the image segmenter
    createImageSegmenter();
});