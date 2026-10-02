export interface ColorToken {
  primary: string;
  secondary: string;
  success: string;
  warning: string;
  danger: string;
  background: string;
  text: string;
  border: string;
}

export interface SpacingToken {
  xs: string;
  sm: string;
  md: string;
  lg: string;
  xl: string;
}

export interface TypographyToken {
  fontFamily: string;
  fontSize: string;
  fontWeight: string;
  lineHeight: string;
}

export interface ThemeTokens {
  colors: ColorToken;
  spacing: SpacingToken;
  typography: TypographyToken;
  borders: Record<string, string>;
  shadows: Record<string, string>;
}
