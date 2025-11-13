<!-- 24a65706-70c1-4cfe-a049-7f0fc6e4140e 1d977a40-3cb2-4c4b-84cb-1cf3de8cf0e2 -->
# Add Image Paste Functionality for Code Generation

## Overview

Enable users to paste images into the FrontendAgent textarea. When an image is detected, it will be converted to base64 and sent to the backend API along with a prompt. The backend will format the image for Anthropic's vision API to generate code from the screenshot.

## Implementation Steps

### 1. Frontend Changes (`apps/frontend/components/FrontendAgent.tsx`)

- Add state for image data (base64 string and preview)
- Add `onPaste` handler to Textarea that:
- Detects image files from clipboard
- Converts to base64 using FileReader
- Stores image data and preview
- Optionally shows image preview in UI
- Modify `handleSubmit` to check if image exists and include it in submission
- Update UI to show image preview when image is pasted

### 2. Update Hook (apps/frontend/app/hooks/useSubmitPrompt.tsx)

Modify submitPrompt function to accept optional image data (base64 string and media type)
Update API call to send both prompt and imageData (with base64, mediaType) in request body

### 3. Backend Changes (apps/backend/index.ts - setFrontendPrompt function)

Update request body to accept optional imageData: { base64: string, mediaType: string }
Modify message content array to include image block when imageData is present:
content: imageData ? [
{
type: "image",
source: {
type: "base64",
media_type: imageData.mediaType,
data: imageData.base64
}
},
{
type: "text",
text: prompt || "Generate a React component using Tailwind CSS that recreates this UI exactly. Use functional components with hooks. Make it fully interactive and production-ready."
}
] : prompt
Update Anthropic API call to use the content array format

### Files to Modify

- `apps/frontend/components/FrontendAgent.tsx` - Add paste handler and image state
- `apps/frontend/app/hooks/useSubmitPrompt.tsx` - Update to handle image data
- `apps/backend/index.ts` - Update `setFrontendPrompt` to process images

## Technical Notes

- Use Clipboard API to detect pasted images
- Convert images to base64 for transmission
- Anthropic API supports images in message content array
- Default prompt will be used if no text is provided with image

### To-dos

- [ ] 1. Frontend Changes (apps/frontend/components/FrontendAgent.tsx)
Add state for image data (base64 string and preview)
Add onPaste handler to Textarea that:
Detects image files from clipboard
Converts to base64 using FileReader
Stores image data and preview
Optionally shows image preview in UI
Modify handleSubmit to check if image exists and include it in submission
Update UI to show image preview when image is pasted

- [ ] 2. Update Hook (apps/frontend/app/hooks/useSubmitPrompt.tsx)
Modify submitPrompt function to accept optional image data (base64 string and media type)
Update API call to send both prompt and imageData (with base64, mediaType) in request body

- [ ] 3. Backend Changes (apps/backend/index.ts - setFrontendPrompt function)
Update request body to accept optional imageData: { base64: string, mediaType: string }
Modify message content array to include image block when imageData is present:
content: imageData ? [
  {
    type: "image",
    source: {
      type: "base64",
      media_type: imageData.mediaType,
      data: imageData.base64
    }
  },
  {
    type: "text",
    text: prompt || "Generate a React component using Tailwind CSS that recreates this UI exactly. Use functional components with hooks. Make it fully interactive and production-ready."
  }
] : prompt
Update Anthropic API call to use the content array format

- [ ] 