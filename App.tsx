import React, { useRef, useEffect, useState } from 'react';
import {
  SafeAreaView,
  StyleSheet,
  BackHandler,
  Alert,
  StatusBar,
  Platform,
  View,
  PermissionsAndroid
  Dimensions,
} from 'react-native';
import { WebView } from 'react-native-webview';

const PERMISSION_CONFIG = require('./permissionConfig').PERMISSION_CONFIG;

// Get device dimensions for better responsive handling
const { width: screenWidth, height: screenHeight } = Dimensions.get('window');


const requestPermissions = async () => {
  if (Platform.OS === 'android') {
    try {
      const permissionsToRequest = [];
      
      // Check each permission based on build configuration
      if (PERMISSION_CONFIG.camera) {
        permissionsToRequest.push(PermissionsAndroid.PERMISSIONS.CAMERA);
      }
      
      if (PERMISSION_CONFIG.location) {
        permissionsToRequest.push(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
        permissionsToRequest.push(PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION);
      }
      
      if (PERMISSION_CONFIG.microphone) {
        permissionsToRequest.push(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
      }
      
      if (PERMISSION_CONFIG.notifications && Platform.Version >= 33) {
        permissionsToRequest.push(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
      }
      
      if (PERMISSION_CONFIG.contacts) {
        permissionsToRequest.push(PermissionsAndroid.PERMISSIONS.READ_CONTACTS);
        permissionsToRequest.push(PermissionsAndroid.PERMISSIONS.WRITE_CONTACTS);
      }
      
      if (permissionsToRequest.length > 0) {
        console.log('Requesting permissions:', permissionsToRequest);
        
        const granted = await PermissionsAndroid.requestMultiple(permissionsToRequest);
        
        Object.keys(granted).forEach(permission => {
          if (granted[permission] === PermissionsAndroid.RESULTS.GRANTED) {
            console.log(`${permission} permission granted`);
          } else {
            console.log(`${permission} permission denied`);
          }
        });
        
        return granted;
      } else {
        console.log('No additional permissions to request');
        return {};
      }
    } catch (err) {
      console.warn('Permission request error:', err);
      return {};
    }
  }
  return {};
};

const App = () => {
  const webViewRef = useRef<WebView>(null);
  const [statusBarStyle, setStatusBarStyle] = useState<
    'light-content' | 'dark-content'
  >('dark-content');
  const [statusBarBg, setStatusBarBg] = useState('#ffffff');
  const [refreshing, setRefreshing] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);
const [permissionsGranted, setPermissionsGranted] = useState({});

  const onRefresh = () => {
    setRefreshing(true);
    webViewRef.current?.reload();
  };

  // Replace this URL with your desired URL
  const INITIAL_URL = "{{website_address}}";

  useEffect(() => {
  const initializePermissions = async () => {
    const granted = await requestPermissions();
    setPermissionsGranted(granted);
  };
  
  initializePermissions();
}, []);

  useEffect(() => {
    const backAction = () => {
      if (webViewRef.current && canGoBack) {
        webViewRef.current.goBack();
        return true; // Prevent default back button behavior
      } else {
        // Show exit confirmation when user tries to go back from first page
        Alert.alert(
          'Exit App', 
          'Do you want to exit the app?', 
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Exit', onPress: () => BackHandler.exitApp() },
          ],
          { cancelable: true }
        );
        return true;
      }
    };

    const backHandler = BackHandler.addEventListener(
      'hardwareBackPress',
      backAction,
    );

    return () => backHandler.remove();
  }, [canGoBack]);

  const onNavigationStateChange = (navState: any) => {
    setCanGoBack(navState.canGoBack);
    // Stop refreshing when navigation completes
    if (refreshing) {
      setRefreshing(false);
    }
  };

  const injectedJS = `
    (function() {
      function rgbToHex(color) {
        if (!color) return '#ffffff';
        
        // Handle hex colors
        if (color.startsWith('#')) return color;
        
        // Handle rgb/rgba colors
        const rgb = color.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/i);
        if (!rgb) return '#ffffff';
        
        const r = parseInt(rgb[1], 10);
        const g = parseInt(rgb[2], 10);
        const b = parseInt(rgb[3], 10);
        
        return "#" + [r, g, b].map(x => {
          const hex = x.toString(16);
          return hex.length === 1 ? '0' + hex : hex;
        }).join('');
      }

      function isDark(hexColor) {
        const hex = hexColor.replace('#', '');
        if (hex.length !== 6) return false;
        
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        
        // Use proper luminance calculation
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        return luminance < 0.5;
      }

      function getTheme() {
        try {
          const bodyStyle = window.getComputedStyle(document.body);
          const htmlStyle = window.getComputedStyle(document.documentElement);
          
          // Try multiple sources for background color
          const rawColor = bodyStyle.backgroundColor || 
                           htmlStyle.backgroundColor || 
                           '#ffffff';
          
          const backgroundColor = rgbToHex(rawColor);
          const darkMode = isDark(backgroundColor);

          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'THEME_UPDATE',
            theme: {
              backgroundColor,
              barStyle: darkMode ? 'light-content' : 'dark-content'
            }
          }));
        } catch (error) {
          // Fallback to default theme
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'THEME_UPDATE',
            theme: {
              backgroundColor: '#ffffff',
              barStyle: 'dark-content'
            }
          }));
        }
      }

      // Initial theme detection
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', getTheme);
      } else {
        getTheme();
      }

      // Periodic theme detection
      let themeInterval = setInterval(getTheme, 3000);
      
      // Also check on visibility change
      document.addEventListener('visibilitychange', getTheme);
      
      // Cleanup interval when page unloads
      window.addEventListener('beforeunload', () => {
        clearInterval(themeInterval);
      });

      // Add viewport meta tag if not present for better mobile experience
      if (!document.querySelector('meta[name="viewport"]')) {
        const viewport = document.createElement('meta');
        viewport.name = 'viewport';
        viewport.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no';
        document.head.appendChild(viewport);
      }
    })();
  `;

  const onError = (syntheticEvent: any) => {
    const { nativeEvent } = syntheticEvent;
    console.warn('WebView error: ', nativeEvent);
    
    Alert.alert(
      'Connection Error',
      'Unable to load the page. Please check your internet connection and try again.',
      [
        { text: 'Retry', onPress: () => webViewRef.current?.reload() },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const onHttpError = (syntheticEvent: any) => {
    const { nativeEvent } = syntheticEvent;
    console.warn('WebView HTTP error: ', nativeEvent);
  };

  return (
    <View style={styles.container}>
      <StatusBar
        barStyle={statusBarStyle}
        backgroundColor={statusBarBg}
        translucent={false}
      />
      
      <SafeAreaView style={[styles.webviewContainer, { backgroundColor: statusBarBg }]}>
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
          allowsBackForwardNavigationGestures={Platform.OS === 'ios'}
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          bounces={Platform.OS === 'ios'}
          scrollEnabled={true}
          injectedJavaScript={injectedJS}
          allowsInlineMediaPlayback={true}
          mediaPlaybackRequiresUserAction={false}
          allowsFullscreenVideo={true}
          pullToRefreshEnabled={true}
          onRefresh={onRefresh}
          refreshing={refreshing}
          
          // Error handling
          onError={onError}
          onHttpError={onHttpError}
          
          // Handle messages from WebView
          onMessage={event => {
            try {
              const data = JSON.parse(event.nativeEvent.data);
              
              if (data.type === 'THEME_UPDATE' && data.theme) {
                setStatusBarStyle(data.theme.barStyle);
                setStatusBarBg(data.theme.backgroundColor);
              }
            } catch (error) {
              console.warn('Error parsing WebView message:', error);
            }
          }}
          
          // Security and performance
          onShouldStartLoadWithRequest={request => {
            // Add any URL filtering logic here if needed
            return true;
          }}
          
          // Additional WebView props for better UX
          textZoom={100}
          cacheEnabled={true}
          incognito={false}
          thirdPartyCookiesEnabled={true}
          sharedCookiesEnabled={true}
        />
      </SafeAreaView>
    </View>
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
    // Ensure proper spacing on all devices
    paddingTop: Platform.select({
      ios: 0, // SafeAreaView handles this on iOS
      android: 0, // StatusBar with translucent={false} handles this
      default: 0,
    }),
  },
  webview: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: 'transparent',
  },
});

export default App;
