import { View, Text, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const LOGO_URL = 'https://raw.createusercontent.com/ef83fbea-b45f-4d4d-8f71-c23d5eb0a565/';

export default function Index() {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: '#0D0D0D',
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: insets.top,
        paddingBottom: insets.bottom,
      }}
    >
      <StatusBar style="light" />

      {/* Logo */}
      <View
        style={{
          width: 88,
          height: 88,
          borderRadius: 22,
          overflow: 'hidden',
          marginBottom: 24,
          shadowColor: '#3B82F6',
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.6,
          shadowRadius: 20,
          elevation: 12,
        }}
      >
        <Image
          source={{ uri: LOGO_URL }}
          style={{ width: 88, height: 88 }}
          contentFit="cover"
          transition={200}
        />
      </View>

      {/* Name */}
      <Text
        style={{
          color: '#F9FAFB',
          fontSize: 22,
          fontWeight: '700',
          letterSpacing: -0.5,
          marginBottom: 6,
        }}
      >
        Risk Whisperer
      </Text>
      <Text
        style={{
          color: '#6B7280',
          fontSize: 13,
          marginBottom: 40,
        }}
      >
        Mantle RWA AI Agent
      </Text>

      {/* Loader */}
      <ActivityIndicator color="#3B82F6" size="small" />

      {/* Bottom tag */}
      <View
        style={{
          position: 'absolute',
          bottom: insets.bottom + 24,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#22C55E' }} />
        <Text style={{ color: '#6B7280', fontSize: 12 }}>Agent Active · Mantle Mainnet</Text>
      </View>
    </View>
  );
}
