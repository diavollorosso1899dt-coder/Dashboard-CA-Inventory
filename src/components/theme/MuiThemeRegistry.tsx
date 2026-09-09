'use client';

import React, { useMemo } from 'react';
import { createTheme, ThemeProvider as MuiThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { useTheme } from './ThemeContext';

export function MuiThemeRegistry({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();

  const muiTheme = useMemo(() => {
    const isDark = theme === 'dark';
    return createTheme({
      palette: {
        mode: isDark ? 'dark' : 'light',
        primary: {
          main: isDark ? '#a8c7fa' : '#0b57d0', // Google M3 Blue
          light: '#d3e3fd',
          dark: '#041e49',
          contrastText: isDark ? '#041e49' : '#ffffff',
        },
        secondary: {
          main: isDark ? '#6dd58c' : '#137333', // Google M3 Green
          light: '#c4eed0',
          dark: '#0f5223',
        },
        warning: {
          main: isDark ? '#ffb951' : '#b06000', // Google M3 Yellow
        },
        error: {
          main: isDark ? '#f2b8b5' : '#b3261e', // Google M3 Red
        },
        background: {
          default: isDark ? '#131314' : '#f8fafd',
          paper: isDark ? '#1e1f20' : '#ffffff',
        },
        text: {
          primary: isDark ? '#e3e3e3' : '#1f1f1f',
          secondary: isDark ? '#c4c7c5' : '#444746',
        },
      },
      shape: {
        borderRadius: 12, // Google M3 standard radius
      },
      typography: {
        fontFamily: "'Google Sans', 'Google Sans Text', Roboto, -apple-system, BlinkMacSystemFont, sans-serif",
        button: {
          textTransform: 'none',
          fontWeight: 600,
        },
      },
      components: {
        MuiButton: {
          styleOverrides: {
            root: {
              borderRadius: 9999, // Google pill buttons
              boxShadow: 'none',
              padding: '6px 18px',
              '&:hover': {
                boxShadow: '0 1px 3px 0 rgba(60,64,67,0.3)',
              },
            },
          },
        },
        MuiChip: {
          styleOverrides: {
            root: {
              fontWeight: 500,
              borderRadius: 8,
            },
          },
        },
        MuiTooltip: {
          styleOverrides: {
            tooltip: {
              backgroundColor: isDark ? '#282a2c' : '#1f1f1f',
              color: '#ffffff',
              fontSize: '0.75rem',
              borderRadius: 8,
              padding: '4px 10px',
              border: isDark ? '1px solid #444746' : 'none',
            },
          },
        },
      },
    });
  }, [theme]);

  return (
    <MuiThemeProvider theme={muiTheme}>
      <CssBaseline enableColorScheme />
      {children}
    </MuiThemeProvider>
  );
}
