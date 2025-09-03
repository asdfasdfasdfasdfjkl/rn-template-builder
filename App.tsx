import React, { useRef, useEffect, useState } from 'react';
import {
  SafeAreaView,
  StyleSheet,
  BackHandler,
  Alert,
  StatusBar,
  Platform,
} from 'react-native';
import { WebView } from 'react-native-webview';

const App = () => {
  const webViewRef = useRef<WebView>(null);
  // React state for StatusBar style & background
  const [statusBarStyle, setStatusBarStyle] = useState<
    'light-content' | 'dark-content'
  >('dark-content');
  const [statusBarBg, setStatusBarBg] = useState('#000000ff');
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = () => {
    setRefreshing(true);
    webViewRef.current?.reload(); // Reload the webview
  };

  // Replace this URL with your desired URL
  const INITIAL_URL = "{{website_address}}";

  useEffect(() => {
    const backAction = () => {
      if (webViewRef.current) {
        // Check if we can go back in WebView
        webViewRef.current.injectJavaScript(`
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'CAN_GO_BACK',
            canGoBack: window.history.length > 1
          }));
        `);

        // Try to go back, if it fails we'll handle it in onMessage
        webViewRef.current.goBack();
        return true; // Prevent default back button behavior
      }
      return false;
    };

    const backHandler = BackHandler.addEventListener(
      'hardwareBackPress',
      backAction,
    );

    return () => backHandler.remove();
  }, []);

  useEffect(() => {
    console.log(statusBarBg);
    console.log(statusBarStyle);
  }, [statusBarBg, statusBarStyle]);

  const onNavigationStateChange = (navState: any) => {
    // Store navigation state for back button handling
    webViewRef.current.canGoBack = navState.canGoBack;
  };

  const handleBackPress = () => {
    if (webViewRef.current) {
      webViewRef.current.goBack();
    }
  };

  const injectedJS = `
  (function() {
    function rgbToHex(color) {
      const rgb = color.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/i);
      if (!rgb) return color; // If not rgb/rgba, assume it's already hex
      const r = parseInt(rgb[1], 10);
      const g = parseInt(rgb[2], 10);
      const b = parseInt(rgb[3], 10);
      return "#" + [r, g, b].map(x =>
        x.toString(16).padStart(2, '0')
      ).join('');
    }

    function isDark(hexColor) {
      // Remove "#" if present
      const hex = hexColor.replace('#', '');
      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);
      const luminance = (0.299*r + 0.587*g + 0.114*b) / 255;
      return luminance < 0.5;
    }

    function getTheme() {
      const bodyStyle = window.getComputedStyle(document.body);
      const rawColor = bodyStyle.backgroundColor || '#ffffff';
      const backgroundColor = rgbToHex(rawColor);
      const darkMode = isDark(backgroundColor);

      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'THEME_UPDATE',
        theme: {
          backgroundColor,
          barStyle: darkMode ? 'light-content' : 'dark-content'
        }
      }));
    }

    getTheme();
    setInterval(getTheme, 5000);
  })();
`;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar
        barStyle={statusBarStyle}
        backgroundColor={statusBarBg}
        translucent={false}
      />
      <SafeAreaView style={styles.webviewContainer}>
        <WebView
          ref={webViewRef}
          source={{ uri: INITIAL_URL }}
          style={styles.webview}
          onNavigationStateChange={onNavigationStateChange}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          startInLoadingState={true}
          scalesPageToFit={false}
          mixedContentMode="compatibility"
          allowsBackForwardNavigationGestures={true}
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          bounces={false}
          scrollEnabled={true}
          injectedJavaScript={injectedJS}
          // Handle messages from WebView
          onMessage={event => {
            try {
              const data = JSON.parse(event.nativeEvent.data);
              if (data.type === 'THEME_UPDATE' && data.theme) {
                setStatusBarStyle(data.theme.barStyle);
                setStatusBarBg(data.theme.backgroundColor);
              }
              if (data.type === 'CAN_GO_BACK' && !data.canGoBack) {
                // Show exit confirmation when user tries to go back from first page
                Alert.alert('Exit App', 'Do you want to exit the app?', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Exit', onPress: () => BackHandler.exitApp() },
                ]);
              }
            } catch (error) {
              // Handle any parsing errors silently
            }
          }}
          // Ensure WebView handles back navigation properly
          onShouldStartLoadWithRequest={request => {
            return true;
          }}
        />
      </SafeAreaView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  webviewContainer: {
    flex: 1,
    backgroundColor: '#ffffff',
    // paddingTop: Platform.OS === 'ios' ? 0 : StatusBar.currentHeight || 0,
  },
  webview: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: '#ffffff',
  },
});

export default App;
