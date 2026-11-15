import { createTheme } from '@mui/material/styles';
import { blue, green, grey, red, yellow } from '@mui/material/colors';

export const theme = createTheme({
  cssVariables: true,
  palette: {
    primary: { main: blue[700] },
    error: { main: red[700] },
    warning: { main: yellow[700], light: yellow[100], dark: yellow[900], contrastText: grey[900] },
    success: { main: green[700] },
    background: { default: grey[50] },
  },
  typography: { fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  components: {
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: { root: { textTransform: 'none', whiteSpace: 'nowrap' } },
    },
    MuiPaper: { defaultProps: { elevation: 0 } },
    MuiTableCell: { styleOverrides: { head: { fontWeight: 600 } } },
  },
});
