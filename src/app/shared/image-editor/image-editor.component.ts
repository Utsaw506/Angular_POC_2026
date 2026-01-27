import { CommonModule } from '@angular/common';
import {
  Component,
  ElementRef,
  EventEmitter,
  Input,
  Output,
  ViewChild
} from '@angular/core';
import { FormsModule } from '@angular/forms';

type Tool =
  | 'draw'
  | 'rectangle'
  | 'circle'
  | 'dottedRectangle'
  | 'dottedCircle'
  | 'path'
  | 'crop';

interface Shape {
  type: Tool;
  points: { x: number; y: number }[];
  color: string;
  width: number;
}

@Component({
  selector: 'app-image-editor',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './image-editor.component.html',
  styleUrl: './image-editor.component.css'
})
export class ImageEditorComponent {

  @Input() imageUrl = '';
  @Input() caption = '';
  @Input() enlarged = false;

  @Output() closed = new EventEmitter<void>();
  @Output() saved = new EventEmitter<{
    url: string;
    caption: string;
    enlarged: boolean;
  }>();

  @ViewChild('canvas') canvasRef!: ElementRef<HTMLCanvasElement>;
  private ctx!: CanvasRenderingContext2D;
  private img = new Image();

  currentTool: Tool = 'draw';
  drawColor = '#ff0000';
  lineWidth = 3;

  isDrawing = false;
  startX = 0;
  startY = 0;

  currentPath: { x: number; y: number }[] = [];
  drawnShapes: Shape[] = [];

  cropRect: { x: number; y: number; w: number; h: number } | null = null;

  ngAfterViewInit() {
    this.ctx = this.canvasRef.nativeElement.getContext('2d')!;
    this.loadImage();
  }

  loadImage() {
    this.img = new Image();
    this.img.onload = () => {
      const canvas = this.canvasRef.nativeElement;
      canvas.width = this.img.width;
      canvas.height = this.img.height;

      this.ctx.imageSmoothingEnabled = true;
      this.ctx.imageSmoothingQuality = 'high';
      this.redraw();
    };
    this.img.src = this.imageUrl;
  }

  setTool(tool: Tool) {
    this.currentTool = tool;
    this.cropRect = null;
    this.redraw();
  }

  reset() {
    this.drawnShapes = [];
    this.currentPath = [];
    this.currentTool = 'draw';
    this.loadImage();
  }

  rotate(dir: 'left' | 'right') {
    const canvas = this.canvasRef.nativeElement;

    const temp = document.createElement('canvas');
    temp.width = canvas.width;
    temp.height = canvas.height;
    temp.getContext('2d')!.drawImage(canvas, 0, 0);

    const rotated = document.createElement('canvas');
    rotated.width = canvas.height;
    rotated.height = canvas.width;

    const rctx = rotated.getContext('2d')!;
    rctx.translate(rotated.width / 2, rotated.height / 2);
    rctx.rotate((dir === 'left' ? -90 : 90) * Math.PI / 180);
    rctx.drawImage(temp, -canvas.width / 2, -canvas.height / 2);

    canvas.width = rotated.width;
    canvas.height = rotated.height;

    this.ctx = canvas.getContext('2d')!;
    this.ctx.drawImage(rotated, 0, 0);

    this.imageUrl = canvas.toDataURL('image/png');
    this.img.src = this.imageUrl;
  }

  onMouseDown(ev: MouseEvent) {
    const { x, y } = this.getXY(ev);

    this.isDrawing = true;
    this.startX = x;
    this.startY = y;

    if (this.currentTool === 'draw') {
      this.currentPath = [{ x, y }];
    }

    if (this.currentTool === 'crop') {
      this.cropRect = { x, y, w: 0, h: 0 };
    }
  }

  onMouseMoveold(ev: MouseEvent) {
    if (!this.isDrawing) return;

    const { x, y } = this.getXY(ev);

    this.redraw();

    switch (this.currentTool) {

      case 'draw':
        this.currentPath.push({ x, y });
        this.drawPath(this.ctx, this.currentPath);
        break;

      case 'rectangle':
      case 'dottedRectangle':
        this.drawRect(this.startX, this.startY, x, y);
        break;

      case 'circle':
      case 'dottedCircle':
        this.drawCircle(this.startX, this.startY, x, y);
        break;

      case 'crop':
        if (this.cropRect) {
          this.cropRect.w = x - this.startX;
          this.cropRect.h = y - this.startY;
        }
        break;
    }

    this.redrawShapes();
    if (this.cropRect) this.drawCropBox();
  }

  onMouseUp() {
    if (!this.isDrawing) return;

    if (this.currentTool !== 'crop') {
      this.saveShape();
    }

    this.isDrawing = false;
  }

  saveShape() {
    if (this.currentTool === 'draw') {
      this.drawnShapes.push({
        type: 'draw',
        points: [...this.currentPath],
        color: this.drawColor,
        width: this.lineWidth
      });
      return;
    }

    this.drawnShapes.push({
      type: this.currentTool,
      points: [
        { x: this.startX, y: this.startY },
        { x: this.getLastX(), y: this.getLastY() }
      ],
      color: this.drawColor,
      width: this.lineWidth
    });
  }

  getLastX() {
    return this.currentPath.at(-1)?.x || this.startX;
  }

  getLastY() {
    return this.currentPath.at(-1)?.y || this.startY;
  }

  applyCrop() {
    if (!this.cropRect) return;

    const c = this.canvasRef.nativeElement;

    const x = Math.min(this.cropRect.x, this.cropRect.x + this.cropRect.w);
    const y = Math.min(this.cropRect.y, this.cropRect.y + this.cropRect.h);
    const w = Math.abs(this.cropRect.w);
    const h = Math.abs(this.cropRect.h);

    const data = this.ctx.getImageData(x, y, w, h);

    c.width = w;
    c.height = h;

    this.ctx = c.getContext('2d')!;
    this.ctx.putImageData(data, 0, 0);

    this.imageUrl = c.toDataURL('image/png');
    this.img.src = this.imageUrl;

    this.cropRect = null;
    this.drawnShapes = [];
    this.currentTool = 'draw';
  }

  redraw() {
    const c = this.canvasRef.nativeElement;
    this.ctx.clearRect(0, 0, c.width, c.height);
    this.ctx.drawImage(this.img, 0, 0);
  }

  redrawShapes() {
    this.drawnShapes.forEach(s => {
      this.ctx.strokeStyle = s.color;
      this.ctx.lineWidth = s.width;
      this.ctx.setLineDash(
        s.type.includes('dotted') ? [6, 6] : []
      );

      if (s.type === 'draw') this.drawPath(this.ctx, s.points);
      if (s.type.includes('rectangle')) this.drawRectPts(s.points);
      if (s.type.includes('circle')) this.drawCirclePts(s.points);
    });
  }

  drawPath(p0: CanvasRenderingContext2D, pts: any[]) {
    p0.beginPath();
    p0.moveTo(pts[0].x, pts[0].y);
    pts.forEach(p => p0.lineTo(p.x, p.y));
    p0.stroke();
  }

  drawRect(x1: number, y1: number, x2: number, y2: number) {
    this.ctx.strokeStyle = this.drawColor;
    this.ctx.lineWidth = this.lineWidth;
    this.ctx.setLineDash(
      this.currentTool.includes('dotted') ? [6, 6] : []
    );
    this.ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
  }

  drawRectPts(p: any[]) {
    this.drawRect(p[0].x, p[0].y, p[1].x, p[1].y);
  }

  drawCircle(x1: number, y1: number, x2: number, y2: number) {
    const r = Math.hypot(x2 - x1, y2 - y1);
    this.ctx.beginPath();
    this.ctx.setLineDash(
      this.currentTool.includes('dotted') ? [6, 6] : []
    );
    this.ctx.arc(x1, y1, r, 0, Math.PI * 2);
    this.ctx.stroke();
  }

  drawCirclePts(p: any[]) {
    this.drawCircle(p[0].x, p[0].y, p[1].x, p[1].y);
  }

  drawCropBox() {
    if (!this.cropRect) return;
    this.ctx.setLineDash([8, 6]);
    this.ctx.strokeStyle = '#0066ff';
    this.ctx.strokeRect(
      this.cropRect.x,
      this.cropRect.y,
      this.cropRect.w,
      this.cropRect.h
    );
    this.ctx.setLineDash([]);
  }

  save() {
    const base64 = this.canvasRef.nativeElement.toDataURL('image/png');
    this.saved.emit({
      url: base64,
      caption: this.caption,
      enlarged: this.enlarged
    });
  }

  getXY(ev: MouseEvent) {
    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    const scaleX = this.canvasRef.nativeElement.width / rect.width;
    const scaleY = this.canvasRef.nativeElement.height / rect.height;

    return {
      x: (ev.clientX - rect.left) * scaleX,
      y: (ev.clientY - rect.top) * scaleY
    };
  }

  //for testing purpose
   currentMouseX = 0;
  currentMouseY = 0;

   onMouseMove(event: MouseEvent): void {
    const coords = this.getCanvasCoordinates(event);
    this.currentMouseX = coords.x;
    this.currentMouseY = coords.y;
  }
  getCanvasCoordinates(event: MouseEvent): { x: number; y: number } {
    if (!this.canvasRef) return { x: 0, y: 0 };

    const canvas = this.canvasRef.nativeElement;
    const rect = canvas.getBoundingClientRect();

    // Get mouse position relative to the canvas element
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    // Calculate scaling factors between display size and high-resolution canvas
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    // Convert mouse coordinates to canvas coordinates
    const x = mouseX * scaleX;
    const y = mouseY * scaleY;

    // Debug logging to help troubleshoot
    console.log('Mouse Debug:', {
      mouseX, mouseY,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      displayWidth: rect.width,
      displayHeight: rect.height,
      scaleX, scaleY,
      finalX: x, finalY: y
    });

    return { x, y };
  }
  isDraggingCrop = false;
  isDraggingShape = false;
  draggedShapeIndex = -1;

cropSelection: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null = null;
   dragStartX = 0;
  dragStartY = 0;
  cropStartX = 0;
  cropStartY = 0;
  shapeStartX = 0;
  shapeStartY = 0;

  draw(event: MouseEvent): void {
    if (!this.isDrawing && !this.isDraggingCrop && !this.isDraggingShape || !this.canvasRef) return;

    const { x, y } = this.getCanvasCoordinates(event);
    const ctx = this.canvasRef.nativeElement.getContext('2d');
    if (!ctx) return;

    // Handle crop dragging
    if (this.isDraggingCrop && this.cropSelection) {
      const deltaX = x - this.dragStartX;
      const deltaY = y - this.dragStartY;

      // Update crop selection position
      this.cropSelection.x = this.cropStartX + deltaX;
      this.cropSelection.y = this.cropStartY + deltaY;

      // Ensure crop selection stays within canvas bounds
      const canvas = this.canvasRef.nativeElement;
      this.cropSelection.x = Math.max(0, Math.min(this.cropSelection.x, canvas.width - this.cropSelection.width));
      this.cropSelection.y = Math.max(0, Math.min(this.cropSelection.y, canvas.height - this.cropSelection.height));

      // Redraw everything with updated crop position
      this.redrawBaseImage();
      this.drawCropOverlay(ctx, this.cropSelection.x, this.cropSelection.y, this.cropSelection.width, this.cropSelection.height);
      this.redrawAllShapes();
      return;
    }

    // Handle shape dragging
    if (this.isDraggingShape && this.draggedShapeIndex >= 0) {
      const deltaX = x - this.dragStartX;
      const deltaY = y - this.dragStartY;

      const shape = this.drawnShapes[this.draggedShapeIndex];

      // Update shape position based on type
      if (shape.type === 'rectangle' || shape.type === 'dottedRectangle') {
        // Calculate the original rectangle dimensions
        const originalWidth = Math.abs(shape.points[1].x - shape.points[0].x);
        const originalHeight = Math.abs(shape.points[1].y - shape.points[0].y);

        // Move the rectangle maintaining its size
        const newX1 = this.shapeStartX + deltaX;
        const newY1 = this.shapeStartY + deltaY;
        const newX2 = newX1 + originalWidth;
        const newY2 = newY1 + originalHeight;

        // Update both corner points
        shape.points[0].x = newX1;
        shape.points[0].y = newY1;
        shape.points[1].x = newX2;
        shape.points[1].y = newY2;
      } else if (shape.type === 'circle' || shape.type === 'dottedCircle') {
        // Move center point
        shape.points[0].x = this.shapeStartX + deltaX;
        shape.points[0].y = this.shapeStartY + deltaY;
      }

      // Redraw everything with updated shape position
      // this.redrawBaseImage();
      // this.redrawAllShapes();
      return;
    }

    if (!this.isDrawing) return;

    // Always redraw everything from scratch
    this.redrawBaseImage();

    ctx.strokeStyle = this.drawColor;
    ctx.lineWidth = this.lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Draw the current shape being created
    switch (this.currentTool) {
      case 'draw':
        this.currentPath.push({ x, y });
        this.drawPath(ctx, this.currentPath);
        break;
      case 'rectangle':
        ctx.beginPath();
        ctx.rect(this.startX, this.startY, x - this.startX, y - this.startY);
        ctx.stroke();
        break;
      case 'circle': {
        const radius = Math.sqrt(
          Math.pow(x - this.startX, 2) + Math.pow(y - this.startY, 2)
        );
        ctx.beginPath();
        ctx.arc(this.startX, this.startY, radius, 0, Math.PI * 2);
        ctx.stroke();
        break;
      }
      case 'dottedRectangle':
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.rect(this.startX, this.startY, x - this.startX, y - this.startY);
        ctx.stroke();
        ctx.setLineDash([]);
        break;
      case 'dottedCircle': {
        ctx.setLineDash([5, 5]);
        const radius = Math.sqrt(
          Math.pow(x - this.startX, 2) + Math.pow(y - this.startY, 2)
        );
        ctx.beginPath();
        ctx.arc(this.startX, this.startY, radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        break;
      }
      case 'crop':
        // Calculate crop coordinates
        const cropX = Math.min(this.startX, x);
        const cropY = Math.min(this.startY, y);
        const cropWidth = Math.abs(x - this.startX);
        const cropHeight = Math.abs(y - this.startY);

        // Store crop selection
        this.cropSelection = {
          x: cropX,
          y: cropY,
          width: cropWidth,
          height: cropHeight,
        };

        // Draw crop rectangle as an overlay (temporary visual feedback)
        // This is drawn separately and won't be part of the final image
        this.drawCropOverlay(ctx, cropX, cropY, cropWidth, cropHeight);
        break;
    }

    // Redraw all permanent shapes on top
    this.redrawAllShapes();
  }
  private canvasContext: CanvasRenderingContext2D | null = null;
  currentImage!: HTMLImageElement;

  redrawBaseImage(): void {
    if (!this.canvasContext || !this.currentImage || !this.canvasRef) return;

    const canvas = this.canvasRef.nativeElement;

    // Clear the canvas
    this.canvasContext.clearRect(0, 0, canvas.width, canvas.height);

    // Enable high-quality image rendering
    this.canvasContext.imageSmoothingEnabled = true;
    this.canvasContext.imageSmoothingQuality = 'high';

    // Draw the base image to fill the entire canvas with high quality
    this.canvasContext.drawImage(
      this.currentImage,
      0,
      0,
      canvas.width,
      canvas.height
    );

    console.log('Redraw Base Image:', {
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      imageWidth: this.currentImage.width,
      imageHeight: this.currentImage.height,
      imageSmoothingEnabled: this.canvasContext.imageSmoothingEnabled,
      imageSmoothingQuality: this.canvasContext.imageSmoothingQuality
    });
  }

  drawCropOverlay(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number
  ): void {
    ctx.save();
    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = '#0066ff';
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    ctx.rect(x, y, width, height);
    ctx.stroke();

    // Add semi-transparent overlay for the cropped-out area
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.fillRect(0, 0, this.canvasRef.nativeElement.width, y); // Top
    ctx.fillRect(
      0,
      y + height,
      this.canvasRef.nativeElement.width,
      this.canvasRef.nativeElement.height - (y + height)
    ); // Bottom
    ctx.fillRect(0, y, x, height); // Left
    ctx.fillRect(
      x + width,
      y,
      this.canvasRef.nativeElement.width - (x + width),
      height
    ); // Right

    ctx.restore();
  }

  redrawAllShapes(): void {
    if (!this.canvasContext) return;

    // Draw all permanent shapes
    this.drawnShapes.forEach((shape) => {
      this.canvasContext!.strokeStyle = shape.color;
      this.canvasContext!.lineWidth = shape.width;
      this.canvasContext!.lineCap = 'round';
      this.canvasContext!.lineJoin = 'round';

      switch (shape.type) {
        case 'path':
          this.drawPath(this.canvasContext!, shape.points);
          break;
        case 'rectangle':
          this.canvasContext!.beginPath();
          this.canvasContext!.rect(
            shape.points[0].x,
            shape.points[0].y,
            shape.points[1].x - shape.points[0].x,
            shape.points[1].y - shape.points[0].y
          );
          this.canvasContext!.stroke();
          break;
        case 'circle':
          this.canvasContext!.beginPath();
          this.canvasContext!.arc(
            shape.points[0].x,
            shape.points[0].y,
            shape.points[1].x, // radius
            0,
            Math.PI * 2
          );
          this.canvasContext!.stroke();
          break;
        case 'dottedRectangle':
          this.canvasContext!.setLineDash([5, 5]);
          this.canvasContext!.beginPath();
          this.canvasContext!.rect(
            shape.points[0].x,
            shape.points[0].y,
            shape.points[1].x - shape.points[0].x,
            shape.points[1].y - shape.points[0].y
          );
          this.canvasContext!.stroke();
          this.canvasContext!.setLineDash([]);
          break;
        case 'dottedCircle':
          this.canvasContext!.setLineDash([5, 5]);
          this.canvasContext!.beginPath();
          this.canvasContext!.arc(
            shape.points[0].x,
            shape.points[0].y,
            shape.points[1].x, // radius
            0,
            Math.PI * 2
          );
          this.canvasContext!.stroke();
          this.canvasContext!.setLineDash([]);
          break;
      }
    });
  }
}
