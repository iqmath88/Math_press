import type React from "react";

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "math-field": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        "read-only"?: boolean;
        "math-virtual-keyboard-policy"?: string;
      };
    }
  }
}
