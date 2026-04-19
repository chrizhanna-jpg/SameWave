import React, { useState } from "react";
import {
  Alert,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";
import { getTodaysChallenge } from "@/data/samplePhotos";

export default function CameraScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { addMyPhoto, myPhotos } = useApp();
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const challenge = getTodaysChallenge();

  const pickFromLibrary = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Please allow access to your photo library.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (!result.canceled && result.assets[0]) {
      setSelectedPhoto(result.assets[0].uri);
    }
  };

  const takePhoto = async () => {
    if (Platform.OS === "web") {
      pickFromLibrary();
      return;
    }
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Please allow access to your camera.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.8,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (!result.canceled && result.assets[0]) {
      setSelectedPhoto(result.assets[0].uri);
    }
  };

  const submit = () => {
    if (!selectedPhoto) return;
    addMyPhoto(selectedPhoto);
    setSubmitted(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setTimeout(() => {
      router.back();
    }, 1500);
  };

  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 : insets.bottom;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPadding + 8 }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={[styles.backBtn, { backgroundColor: colors.card }]}
        >
          <Feather name="arrow-left" size={20} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>
          Post a Photo
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: bottomPadding + 24 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.challengeCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={styles.challengeEmoji}>{challenge.emoji}</Text>
          <View style={styles.challengeText}>
            <Text style={[styles.challengeTitle, { color: colors.foreground }]}>
              Today's Challenge
            </Text>
            <Text style={[styles.challengeName, { color: colors.primary }]}>
              {challenge.title}
            </Text>
            <Text style={[styles.challengeDesc, { color: colors.mutedForeground }]}>
              {challenge.description}
            </Text>
          </View>
        </View>

        {submitted ? (
          <View style={styles.successContainer}>
            <View style={[styles.successIcon, { backgroundColor: colors.teal + "22" }]}>
              <Feather name="check" size={40} color={colors.teal} />
            </View>
            <Text style={[styles.successTitle, { color: colors.foreground }]}>
              Photo submitted!
            </Text>
            <Text style={[styles.successDesc, { color: colors.mutedForeground }]}>
              We're finding your match from somewhere in the world...
            </Text>
          </View>
        ) : selectedPhoto ? (
          <View style={styles.selectedContainer}>
            <Image
              source={{ uri: selectedPhoto }}
              style={[styles.selectedImage, { borderColor: colors.border }]}
              resizeMode="cover"
            />
            <View style={styles.actionButtons}>
              <TouchableOpacity
                style={[styles.retakeBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => setSelectedPhoto(null)}
              >
                <Feather name="refresh-cw" size={18} color={colors.foreground} />
                <Text style={[styles.retakeBtnText, { color: colors.foreground }]}>
                  Retake
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.submitBtn, { backgroundColor: colors.primary }]}
                onPress={submit}
                activeOpacity={0.85}
              >
                <Text style={[styles.submitBtnText, { color: colors.primaryForeground }]}>
                  Submit & Match
                </Text>
                <Feather name="globe" size={18} color={colors.primaryForeground} />
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.pickOptions}>
            <TouchableOpacity
              style={[styles.pickBtn, { backgroundColor: colors.primary }]}
              onPress={takePhoto}
              activeOpacity={0.85}
            >
              <Feather name="camera" size={28} color="#fff" />
              <Text style={[styles.pickBtnText, { color: "#fff" }]}>
                Take a Photo
              </Text>
              <Text style={[styles.pickBtnSub, { color: "rgba(255,255,255,0.7)" }]}>
                Use your camera
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.pickBtn, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}
              onPress={pickFromLibrary}
              activeOpacity={0.85}
            >
              <Feather name="image" size={28} color={colors.primary} />
              <Text style={[styles.pickBtnText, { color: colors.foreground }]}>
                Choose from Library
              </Text>
              <Text style={[styles.pickBtnSub, { color: colors.mutedForeground }]}>
                Pick an existing photo
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {myPhotos.length > 0 && !submitted && (
          <View style={styles.prevSection}>
            <Text style={[styles.prevTitle, { color: colors.mutedForeground }]}>
              Your recent photos
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.prevScroll}>
              {myPhotos.slice(0, 8).map((photo, i) => (
                <TouchableOpacity key={i} onPress={() => setSelectedPhoto(photo.uri)}>
                  <Image
                    source={{ uri: photo.uri }}
                    style={[styles.prevPhoto, { borderColor: colors.border }]}
                    resizeMode="cover"
                  />
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 8,
    gap: 20,
  },
  challengeCard: {
    flexDirection: "row",
    gap: 16,
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
  },
  challengeEmoji: {
    fontSize: 36,
  },
  challengeText: {
    flex: 1,
    gap: 2,
  },
  challengeTitle: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  challengeName: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
  },
  challengeDesc: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  pickOptions: {
    gap: 12,
  },
  pickBtn: {
    padding: 28,
    borderRadius: 20,
    alignItems: "center",
    gap: 8,
  },
  pickBtnText: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
  },
  pickBtnSub: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  selectedContainer: {
    gap: 16,
  },
  selectedImage: {
    width: "100%",
    height: 280,
    borderRadius: 20,
    borderWidth: 1,
  },
  actionButtons: {
    flexDirection: "row",
    gap: 12,
  },
  retakeBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
  },
  retakeBtnText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  submitBtn: {
    flex: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 52,
    borderRadius: 26,
  },
  submitBtnText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  successContainer: {
    alignItems: "center",
    gap: 16,
    paddingTop: 32,
  },
  successIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  successTitle: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
  },
  successDesc: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 22,
  },
  prevSection: {
    gap: 10,
  },
  prevTitle: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  prevScroll: {
    marginHorizontal: -20,
    paddingHorizontal: 20,
  },
  prevPhoto: {
    width: 80,
    height: 80,
    borderRadius: 12,
    marginRight: 8,
    borderWidth: 1,
  },
});
