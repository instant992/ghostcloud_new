import React, { useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../theme";

/** Модальный сканер QR/штрихкодов на камере. Возвращает сырую строку через onScan. */
export function QRScannerModal({
  visible,
  onClose,
  onScan,
}: {
  visible: boolean;
  onClose: () => void;
  onScan: (value: string) => void;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [denied, setDenied] = useState(false);
  const scanned = useRef(false);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const frameSize = Math.min(320, Math.round(width * 0.67));

  const handleScanned = ({ data }: { data?: string }) => {
    if (!data || scanned.current) return;
    scanned.current = true;
    onScan(data);
  };

  const close = () => {
    scanned.current = false;
    setTorch(false);
    onClose();
  };

  const granted = permission?.granted === true;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close}>
      <View style={{ flex: 1, backgroundColor: "#000" }}>
        {visible && granted && (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            enableTorch={torch}
            onBarcodeScanned={handleScanned}
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          />
        )}

        {/* Затемнение + рамка */}
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          <View style={[styles.dim, { flex: 1 }]} />
          <View style={{ flexDirection: "row", height: frameSize }}>
            <View style={[styles.dim, { flex: 1 }]} />
            <View
              style={{
                width: frameSize,
                height: frameSize,
                borderWidth: 2,
                borderColor: "rgba(255,255,255,0.9)",
                borderRadius: 16,
              }}
            />
            <View style={[styles.dim, { flex: 1 }]} />
          </View>
          <View style={[styles.dim, { flex: 1 }]} />
        </View>

        {/* Верхняя панель */}
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            paddingTop: insets.top + 8,
            paddingHorizontal: 16,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Pressable onPress={close} hitSlop={10} style={styles.iconBtn}>
            <Ionicons name="close" size={24} color="#fff" />
          </Pressable>
          <Text style={{ color: "#fff", fontSize: 15, fontWeight: "700" }}>Сканируйте QR-код</Text>
          <Pressable onPress={() => setTorch((t) => !t)} hitSlop={10} style={styles.iconBtn}>
            <Ionicons name={torch ? "flash" : "flash-outline"} size={24} color="#fff" />
          </Pressable>
        </View>

        {/* Подсказка / запрос разрешения */}
        {!granted && (
          <View style={styles.permissionBox}>
            {permission && !permission.canAskAgain && !permission.granted ? (
              <>
                <Text style={styles.permissionText}>
                  Доступ к камере запрещён. Разрешите его в настройках устройства.
                </Text>
              </>
            ) : denied || (permission && !permission.granted) ? (
              <>
                <Text style={styles.permissionText}>
                  Для сканирования нужен доступ к камере.
                </Text>
                <Pressable
                  style={styles.permissionBtn}
                  onPress={async () => {
                    const p = await requestPermission();
                    if (!p?.granted) setDenied(true);
                  }}
                >
                  <Text style={styles.permissionBtnText}>Разрешить камеру</Text>
                </Pressable>
              </>
            ) : (
              <Text style={styles.permissionText}>Запрашиваем доступ к камере…</Text>
            )}
          </View>
        )}

        {granted && (
          <View style={{ position: "absolute", bottom: insets.bottom + 24, left: 0, right: 0, alignItems: "center" }}>
            <Text style={{ color: "rgba(255,255,255,0.75)", fontSize: 13 }}>
              Наведите камеру на QR-код
            </Text>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  dim: { backgroundColor: "rgba(0,0,0,0.55)" },
  iconBtn: { padding: 8 },
  permissionBox: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    backgroundColor: "rgba(0,0,0,0.85)",
  },
  permissionText: { color: "#fff", fontSize: 14, textAlign: "center", lineHeight: 20 },
  permissionBtn: {
    marginTop: 16,
    backgroundColor: colors.accentDeep,
    borderRadius: 14,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  permissionBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
});
