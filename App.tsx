import React, { useRef, useEffect, useState } from 'react';
import {
  SafeAreaView,
  StyleSheet,
  BackHandler,
  Alert,
  StatusBar,
  Platform,
  View,
  PermissionsAndroid,
  Dimensions
} from 'react-native';
import { WebView } from 'react-native-webview';
import NetInfo from '@react-native-community/netinfo';

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
  const [isLoading, setIsLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(true);
  const [connectionType, setConnectionType] = useState('wifi');

  const onRefresh = () => {
    setRefreshing(true);
    if (isConnected) {
      // Force reload from network when online
      webViewRef.current?.reload();
    } else {
      // Just reload from cache when offline
      webViewRef.current?.reload();
      setRefreshing(false);
    }
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

  // Network status monitoring
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsConnected(state.isConnected ?? false);
      setConnectionType(state.type);
      
      console.log('Network state changed:', {
        isConnected: state.isConnected,
        type: state.type,
        isInternetReachable: state.isInternetReachable
      });
    });

    return () => unsubscribe();
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

  const onLoadEnd = () => {
    setIsLoading(false);
    if (refreshing) {
      setRefreshing(false);
    }
  };

  const onLoadStart = () => {
    setIsLoading(true);
  };

  // Enhanced injected JavaScript with caching and offline handling
  const injectedJS = `
    (function() {
      let lastTheme = null;
      let isOnline = ${isConnected};
      let cacheVersion = 'v1.0';
      
      // Network status monitoring from React Native
      window.addEventListener('message', function(event) {
        if (event.data && event.data.type === 'NETWORK_STATUS') {
          isOnline = event.data.isConnected;
          console.log('Network status updated:', isOnline);
          handleNetworkChange();
        }
      });

      // Enhanced caching system
      function setupCaching() {
        if ('serviceWorker' in navigator) {
          // Register service worker for advanced caching
          navigator.serviceWorker.register('/sw.js').catch(err => {
            console.log('Service worker registration failed');
          });
        }

        // Intercept and cache requests
        if (window.fetch) {
          const originalFetch = window.fetch;
          window.fetch = function(...args) {
            const request = args[0];
            const url = typeof request === 'string' ? request : request.url;
            
            if (isOnline) {
              // When online, fetch from network and cache
              return originalFetch.apply(this, args)
                .then(response => {
                  if (response.ok && shouldCache(url)) {
                    // Clone response for caching
                    const responseClone = response.clone();
                    cacheResponse(url, responseClone);
                  }
                  return response;
                })
                .catch(error => {
                  // If network fails, try cache
                  return getCachedResponse(url) || Promise.reject(error);
                });
            } else {
              // When offline, serve from cache
              return getCachedResponse(url) || originalFetch.apply(this, args);
            }
          };
        }
      }

      function shouldCache(url) {
        // Define what should be cached
        const cacheableExtensions = ['.html', '.css', '.js', '.json', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.woff', '.woff2'];
        const uncacheablePatterns = ['/api/live', '/stream', '/socket', '/ws'];
        
        // Don't cache real-time data
        if (uncacheablePatterns.some(pattern => url.includes(pattern))) {
          return false;
        }
        
        // Cache static resources and main pages
        return cacheableExtensions.some(ext => url.includes(ext)) || 
               url === window.location.href ||
               url.includes(window.location.hostname);
      }

      function cacheResponse(url, response) {
        try {
          if ('caches' in window) {
            caches.open(cacheVersion).then(cache => {
              cache.put(url, response);
            });
          }
        } catch (error) {
          console.log('Caching failed for:', url);
        }
      }

      function getCachedResponse(url) {
        if ('caches' in window) {
          return caches.open(cacheVersion).then(cache => {
            return cache.match(url);
          }).catch(() => null);
        }
        return null;
      }

      function handleNetworkChange() {
        if (isOnline) {
          // When back online, optionally refresh content
          console.log('Back online - content will refresh on next navigation');
        } else {
          console.log('Gone offline - serving cached content');
        }
      }

      // Theme detection (keeping your existing theme code)
      function rgbToHex(color) {
        if (!color || color === 'transparent') return '#ffffff';
        
        if (color.startsWith('#')) {
          return color.length === 7 ? color : '#ffffff';
        }
        
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

      function getLuminance(hexColor) {
        const hex = hexColor.replace('#', '');
        if (hex.length !== 6) return 1;
        
        const r = parseInt(hex.substring(0, 2), 16) / 255;
        const g = parseInt(hex.substring(2, 4), 16) / 255;
        const b = parseInt(hex.substring(4, 6), 16) / 255;
        
        const toLinear = (c) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
        
        const rLinear = toLinear(r);
        const gLinear = toLinear(g);
        const bLinear = toLinear(b);
        
        return 0.2126 * rLinear + 0.7152 * gLinear + 0.0722 * bLinear;
      }

      function isDark(hexColor) {
        return getLuminance(hexColor) < 0.179;
      }

      function getEffectiveBackgroundColor() {
        const elements = [
          document.body,
          document.documentElement,
          document.querySelector('main'),
          document.querySelector('.app'),
          document.querySelector('#app'),
          document.querySelector('#root')
        ].filter(el => el);

        for (const element of elements) {
          const style = window.getComputedStyle(element);
          const bgColor = style.backgroundColor;
          
          if (bgColor && bgColor !== 'rgba(0, 0, 0, 0)' && bgColor !== 'transparent') {
            const hexColor = rgbToHex(bgColor);
            if (hexColor !== '#ffffff' || element === document.body) {
              return hexColor;
            }
          }
        }

        const isDarkMode = document.body.classList.contains('dark') ||
                          document.documentElement.classList.contains('dark') ||
                          document.body.getAttribute('data-theme') === 'dark' ||
                          document.documentElement.getAttribute('data-theme') === 'dark';

        return isDarkMode ? '#121212' : '#ffffff';
      }

      function updateTheme() {
        try {
          const backgroundColor = getEffectiveBackgroundColor();
          const darkMode = isDark(backgroundColor);
          const barStyle = darkMode ? 'light-content' : 'dark-content';
          
          const themeData = {
            backgroundColor,
            barStyle
          };

          if (JSON.stringify(themeData) !== JSON.stringify(lastTheme)) {
            lastTheme = themeData;
            
            if (window.ReactNativeWebView) {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'THEME_UPDATE',
                theme: themeData
              }));
            }
          }
        } catch (error) {
          console.error('Theme detection error:', error);
          
          if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'THEME_UPDATE',
              theme: {
                backgroundColor: '#ffffff',
                barStyle: 'dark-content'
              }
            }));
          }
        }
      }

      // Initialize everything
      function initialize() {
        setupCaching();
        
        const initialDetection = () => {
          setTimeout(updateTheme, 100);
          setTimeout(updateTheme, 500);
          setTimeout(updateTheme, 1000);
        };

        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', initialDetection);
        } else {
          initialDetection();
        }

        if (window.MutationObserver) {
          const observer = new MutationObserver(() => {
            clearTimeout(window.themeUpdateTimeout);
            window.themeUpdateTimeout = setTimeout(updateTheme, 100);
          });
          
          observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['class', 'data-theme', 'style'],
            subtree: true
          });
        }

        let styleSheets = document.styleSheets.length;
        const checkForStyleChanges = () => {
          if (document.styleSheets.length !== styleSheets) {
            styleSheets = document.styleSheets.length;
            updateTheme();
          }
        };
        
        setInterval(checkForStyleChanges, 2000);
        
        document.addEventListener('visibilitychange', () => {
          if (!document.hidden) {
            setTimeout(updateTheme, 100);
          }
        });
      }

      // Start initialization
      initialize();
    })();
  `;

  // Don't show error alerts for network issues - let the website handle it
  const onError = (syntheticEvent: any) => {
    const { nativeEvent } = syntheticEvent;
    console.warn('WebView error: ', nativeEvent);
    setIsLoading(false);
    
    // Only show alert for non-network errors
    if (!nativeEvent.description?.includes('net::') && 
        !nativeEvent.description?.includes('ERR_INTERNET_DISCONNECTED') &&
        !nativeEvent.description?.includes('ERR_NETWORK_CHANGED')) {
      Alert.alert(
        'Error',
        'Something went wrong. Please try again.',
        [
          { text: 'Retry', onPress: () => webViewRef.current?.reload() },
          { text: 'Cancel', style: 'cancel' },
        ]
      );
    }
  };

  const onHttpError = (syntheticEvent: any) => {
    const { nativeEvent } = syntheticEvent;
    console.warn('WebView HTTP error: ', nativeEvent);
    setIsLoading(false);
    // Don't show alerts for HTTP errors - let website handle
  };

  // Send network status updates to WebView
  useEffect(() => {
    if (webViewRef.current) {
      const networkStatusMessage = JSON.stringify({
        type: 'NETWORK_STATUS',
        isConnected: isConnected,
        connectionType: connectionType
      });
      
      webViewRef.current.postMessage(networkStatusMessage);
    }
  }, [isConnected, connectionType]);

  return (
    <View style={styles.container}>
      <StatusBar
        barStyle={statusBarStyle}
        backgroundColor={Platform.OS === 'android' ? statusBarBg : undefined}
        translucent={Platform.OS === 'android'}
        hidden={false}
      />
      
      <SafeAreaView style={[styles.safeArea, { backgroundColor: statusBarBg }]}>
        <WebView
          ref={webViewRef}
          source={{ uri: INITIAL_URL }}
          style={styles.webview}
          onNavigationStateChange={onNavigationStateChange}
          onLoadStart={onLoadStart}
          onLoadEnd={onLoadEnd}
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
          
          // Enhanced caching settings
          cacheEnabled={true}
          cacheMode={isConnected ? 'LOAD_DEFAULT' : 'LOAD_CACHE_ELSE_NETWORK'}
          
          // Error handling - minimal for offline support
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
            return true;
          }}
          
          // Enhanced caching and offline settings
          textZoom={100}
          incognito={false}
          thirdPartyCookiesEnabled={true}
          sharedCookiesEnabled={true}
          
          // Offline-friendly user agent
          userAgent="Mozilla/5.0 (Linux; Android 10; SM-G975F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.120 Mobile Safari/537.36"
          
          // Additional props for better offline experience
          originWhitelist={['*']}
          onContentProcessDidTerminate={() => {
            webViewRef.current?.reload();
          }}
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
  safeArea: {
    flex: 1,
    backgroundColor: '#ffffff',
    paddingTop: Platform.select({
      ios: 0,
      android: StatusBar.currentHeight || 0,
      default: 0,
    }),
  },
  webview: {
    flex: 1,
    width: '100%',
    backgroundColor: '#ffffff',
  },
});

export default App;
