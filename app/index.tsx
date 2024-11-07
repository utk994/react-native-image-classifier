import * as React from "react";
import { useRef, useState, useCallback } from "react";
import type { GestureResponderEvent } from "react-native";
import { StyleSheet, Text, View } from "react-native";
import type { PinchGestureHandlerGestureEvent } from "react-native-gesture-handler";
import {
  GestureHandlerRootView,
  PinchGestureHandler,
  TapGestureHandler,
} from "react-native-gesture-handler";
import type {
  CameraProps,
  CameraRuntimeError,
} from "react-native-vision-camera";
import {
  runAtTargetFps,
  useCameraDevice,
  useCameraFormat,
  useFrameProcessor,
} from "react-native-vision-camera";
import { Camera } from "react-native-vision-camera";
import {
  CONTENT_SPACING,
  CONTROL_BUTTON_SIZE,
  MAX_ZOOM_FACTOR,
  SAFE_AREA_PADDING,
  SCREEN_HEIGHT,
  SCREEN_WIDTH,
} from "@/constants/Camera";
import Reanimated, {
  Extrapolate,
  interpolate,
  useAnimatedGestureHandler,
  useAnimatedProps,
} from "react-native-reanimated";
import { useEffect } from "react";
import { useIsForeground } from "@/hooks/useForeground";
import { useIsFocused } from "@react-navigation/core";
import { useCameraPermission } from "@/hooks/useCameraPermission";
import { useTensorflowModel } from "react-native-fast-tflite";
import { useResizePlugin } from "vision-camera-resize-plugin";
import { useSharedValue } from "react-native-worklets-core";

const ReanimatedCamera = Reanimated.createAnimatedComponent(Camera);
Reanimated.addWhitelistedNativeProps({
  zoom: true,
});

const SCALE_FULL_ZOOM = 3;
const THRESHOLD = 20 / 255;

export default function HomeScreen() {
  const camera = useRef<Camera>(null);
  const [isCameraInitialized, setIsCameraInitialized] = useState(false);
  const zoom = useSharedValue(1);

  // check if camera page is active
  const isFocussed = useIsFocused();
  const isForeground = useIsForeground();
  const isActive = isFocussed && isForeground;

  const { hasCameraPermission } = useCameraPermission();
  let device = useCameraDevice("front");

  const glassesDetected = useSharedValue(false);
  const prevGlassDetectedValue = useRef(false);

  const [glassesDetectedState, setGlassesDetectedState] = useState(false);

  const objectDetection = useTensorflowModel(
    require("@/assets/models/glasses_model.tflite")
  );

  const model =
    objectDetection.state === "loaded" ? objectDetection.model : undefined;

  useEffect(() => {
    let interval: NodeJS.Timeout | undefined;
    if (model !== null) {
      interval = setInterval(() => {
        // to make sure one fluctaating value does not change result
        if (
          prevGlassDetectedValue.current == glassesDetected.value &&
          glassesDetected.value != glassesDetectedState
        ) {
          setGlassesDetectedState(glassesDetected.value);
        }
        prevGlassDetectedValue.current = glassesDetected.value;
      }, 300);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [model, glassesDetectedState]);

  const screenAspectRatio = SCREEN_HEIGHT / SCREEN_WIDTH;
  const format = useCameraFormat(device, [
    { fps: 60 },
    { videoAspectRatio: screenAspectRatio },
    { videoResolution: "max" },
    { photoAspectRatio: screenAspectRatio },
    { photoResolution: "max" },
  ]);

  const fps = Math.min(format?.maxFps ?? 1, 60);

  //#region Animated Zoom
  const minZoom = device?.minZoom ?? 1;
  const maxZoom = Math.min(device?.maxZoom ?? 1, MAX_ZOOM_FACTOR);

  const cameraAnimatedProps = useAnimatedProps<CameraProps>(() => {
    const z = Math.max(Math.min(zoom.value, maxZoom), minZoom);
    return {
      zoom: z,
    };
  }, [maxZoom, minZoom, zoom]);
  //#endregion

  const onError = useCallback((error: CameraRuntimeError) => {
    console.error(error);
  }, []);
  const onInitialized = useCallback(() => {
    setIsCameraInitialized(true);
  }, []);

  //#region Tap Gesture
  const onFocusTap = useCallback(
    ({ nativeEvent: event }: GestureResponderEvent) => {
      if (!device?.supportsFocus) return;
      camera.current?.focus({
        x: event.locationX,
        y: event.locationY,
      });
    },
    [device?.supportsFocus]
  );

  //#region Effects
  useEffect(() => {
    // Reset zoom to it's default everytime the `device` changes.
    zoom.value = device?.neutralZoom ?? 1;
  }, [zoom, device]);
  //#endregion

  //#region Pinch to Zoom Gesture
  // The gesture handler maps the linear pinch gesture (0 - 1) to an exponential curve since a camera's zoom
  // function does not appear linear to the user. (aka zoom 0.1 -> 0.2 does not look equal in difference as 0.8 -> 0.9)
  const onPinchGesture = useAnimatedGestureHandler<
    PinchGestureHandlerGestureEvent,
    { startZoom?: number }
  >({
    onStart: (_, context) => {
      context.startZoom = zoom.value;
    },
    onActive: (event, context) => {
      // we're trying to map the scale gesture to a linear zoom here
      const startZoom = context.startZoom ?? 0;
      const scale = interpolate(
        event.scale,
        [1 - 1 / SCALE_FULL_ZOOM, 1, SCALE_FULL_ZOOM],
        [-1, 0, 1],
        Extrapolate.CLAMP
      );
      zoom.value = interpolate(
        scale,
        [-1, 0, 1],
        [minZoom, startZoom, maxZoom],
        Extrapolate.CLAMP
      );
    },
  });
  //#endregion

  useEffect(() => {
    const f =
      format != null
        ? `(${format.photoWidth}x${format.photoHeight} photo / ${format.videoWidth}x${format.videoHeight}@${format.maxFps} video @ ${fps}fps)`
        : undefined;
  }, [device?.name, format, fps]);

  const { resize } = useResizePlugin();

  const frameProcessor = useFrameProcessor(
    (frame) => {
      "worklet";

      if (model == null) return;

      runAtTargetFps(10, () => {
        "worklet";

        const resized = resize(frame, {
          scale: {
            width: 224,
            height: 224,
          },
          pixelFormat: "rgb",
          dataType: "uint8",
        });

        const outputs = model.runSync([resized]);

        const glassesProbabilty =
          Number(outputs[0][0]) /
          (Number(outputs[0][0]) + Number(outputs[0][1]));

        glassesDetected.value = glassesProbabilty > THRESHOLD;
      });
    },
    [model]
  );

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      {hasCameraPermission ? (
        <View style={styles.container}>
          {device != null ? (
            <PinchGestureHandler
              onGestureEvent={onPinchGesture}
              enabled={isActive}
            >
              <Reanimated.View
                onTouchEnd={onFocusTap}
                style={StyleSheet.absoluteFill}
              >
                <TapGestureHandler numberOfTaps={2}>
                  <ReanimatedCamera
                    style={StyleSheet.absoluteFill}
                    device={device}
                    isActive={isActive}
                    ref={camera}
                    onInitialized={onInitialized}
                    onError={onError}
                    format={format}
                    fps={fps}
                    photoHdr={false}
                    videoHdr={false}
                    photoQualityBalance="quality"
                    lowLightBoost={false}
                    enableZoomGesture={false}
                    animatedProps={cameraAnimatedProps}
                    exposure={0}
                    enableFpsGraph={true}
                    outputOrientation="device"
                    photo={true}
                    video={true}
                    audio={false}
                    enableLocation={false}
                    frameProcessor={frameProcessor}
                  />
                </TapGestureHandler>
              </Reanimated.View>
            </PinchGestureHandler>
          ) : (
            <View style={styles.emptyContainer}>
              <Text style={styles.text}>
                Your phone does not have a Camera.
              </Text>
            </View>
          )}

          <View
            style={[
              styles.textContainer,
              glassesDetectedState
                ? styles.glassesDetected
                : styles.glassesNotDetected,
            ]}
          >
            <Text style={styles.detectedText}>
              {glassesDetectedState
                ? "Glasses detected!"
                : "Glasses not detected"}
            </Text>
          </View>
        </View>
      ) : null}
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "black",
    paddingVertical: 10,
  },
  captureButton: {
    position: "absolute",
    alignSelf: "center",
    bottom: SAFE_AREA_PADDING.paddingBottom,
  },
  button: {
    marginBottom: CONTENT_SPACING,
    width: CONTROL_BUTTON_SIZE,
    height: CONTROL_BUTTON_SIZE,
    borderRadius: CONTROL_BUTTON_SIZE / 2,
    backgroundColor: "rgba(140, 140, 140, 0.3)",
    justifyContent: "center",
    alignItems: "center",
  },
  rightButtonRow: {
    position: "absolute",
    right: SAFE_AREA_PADDING.paddingRight,
    top: SAFE_AREA_PADDING.paddingTop,
  },
  text: {
    color: "white",
    fontSize: 11,
    fontWeight: "bold",
    textAlign: "center",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  textContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    width: "100%",
    paddingVertical: 30,
    justifyContent: "center",
    alignItems: "center",
  },
  glassesDetected: {
    backgroundColor: "green",
  },
  glassesNotDetected: {
    backgroundColor: "red",
  },
  detectedText: {
    color: "white",
    fontSize: 20,
    fontWeight: "bold",
  },
});
