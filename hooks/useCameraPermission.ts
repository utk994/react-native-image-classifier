import { useEffect, useState } from "react";
import { check, PERMISSIONS, request, RESULTS } from "react-native-permissions";

export const useCameraPermission = () => {
  const [hasCameraPermission, setHasCameraPermission] = useState(false);

  useEffect(() => {
    check(PERMISSIONS.ANDROID.CAMERA).then((permissionStatus) => {
      if (permissionStatus !== RESULTS.GRANTED) {
        request(PERMISSIONS.ANDROID.CAMERA).then((requestResult) => {
          if (requestResult === RESULTS.GRANTED) {
            setHasCameraPermission(true);
          }
        });
      }
      setHasCameraPermission(permissionStatus === RESULTS.GRANTED);
    });
  }, []);

  return { hasCameraPermission };
};
