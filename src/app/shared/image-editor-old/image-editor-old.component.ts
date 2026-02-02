import { CommonModule } from '@angular/common';
import {
  Component,
  ElementRef,
  EventEmitter,
  Input,
  Output,
  ViewChild,
  AfterViewInit,
  HostListener
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';

type Tool =
  | 'draw'
  | 'rectangle'
  | 'circle'
  | 'dottedRectangle'
  | 'dottedCircle'
  | 'crop'
  | 'text';

interface Shape {
  type: Tool;
  points: { x: number; y: number }[];
  color: string;
  width: number;
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: string;
}

type ResizeHandle = 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w' | null;
@Component({
  selector: 'app-image-editor-old',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule],
  templateUrl: './image-editor-old.component.html',
  styleUrl: './image-editor-old.component.css'
})
export class ImageEditorOldComponent implements AfterViewInit {
  @Input() imageUrl = '';
  @Input() caption = '';
  @Input() enlarged = false;

  @Output() closed = new EventEmitter<void>();
  @Output() saved = new EventEmitter<any>();

  @ViewChild('canvas') canvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('textInput') textInputRef!: ElementRef<HTMLTextAreaElement>;
  ctx!: CanvasRenderingContext2D;
  img = new Image();

  originalImageUrl = '';

  currentTool: Tool = 'draw';
  drawColor = '#000000';
  lineWidth = 3;
  brightness = 100;

  fontSize = 24;
  fontFamily = 'Arial';
  fontWeight = 'normal';
  isEditingText = false;
  editingTextIndex = -1;
  selectedTextIndex = -1;
  textInputValue = '';
  textInputPosition = { x: 0, y: 0, width: 200, height: 100 };

  isDrawing = false;
  startX = 0;
  startY = 0;
  lastX = 0;
  lastY = 0;

  drawnShapes: Shape[] = [];
  currentPath: { x: number; y: number }[] = [];

  cropSelection: { x: number; y: number; width: number; height: number } | null = null;

  isDraggingCrop = false;
  cropDragStartX = 0;
  cropDragStartY = 0;
  cropStartX = 0;
  cropStartY = 0;

  isResizingCrop = false;
  resizeHandle: ResizeHandle = null;
  resizeStartX = 0;
  resizeStartY = 0;
  resizeOriginalCrop: { x: number; y: number; width: number; height: number } | null = null;

  isDraggingShape = false;
  draggedShapeIndex = -1;
  dragShapeStartX = 0;
  dragShapeStartY = 0;

  isResizingText = false;
  textResizeHandle: ResizeHandle = null;

  shapeStartX = 0;
  shapeStartY = 0;
  shapeStartX2 = 0;
  shapeStartY2 = 0;

  ngAfterViewInit() {
    this.ctx = this.canvasRef.nativeElement.getContext('2d')!;
    this.originalImageUrl = this.imageUrl;
    this.loadImage();
  }

  @HostListener('document:keydown', ['$event'])
  handleKeyDown(event: KeyboardEvent) {
    if ((event.key === 'Delete' || event.key === 'Backspace') && this.selectedTextIndex !== -1 && !this.isEditingText) {
      this.deleteTextBox(this.selectedTextIndex);
      event.preventDefault();
    }
  }

  loadImage() {
    this.img.onload = () => {
      const c = this.canvasRef.nativeElement;
      c.width = this.img.width;
      c.height = this.img.height;
      this.redrawBase();
    };
    this.img.src = this.imageUrl;
  }

  setTool(t: Tool) {
    if (this.currentTool === 'crop' && t !== 'crop') {
      this.cropSelection = null;
    }
    if (this.currentTool === 'text' && t !== 'text') {
      this.finishTextEditing();
    }
    this.currentTool = t;
    this.selectedTextIndex = -1;
  }

  reset() {
    this.imageUrl = this.originalImageUrl;
    this.drawnShapes = [];
    this.cropSelection = null;
    this.currentTool = 'draw';
    this.brightness = 100;
    this.drawColor = '#000000';
    this.lineWidth = 3;
    this.isEditingText = false;
    this.editingTextIndex = -1;
    this.selectedTextIndex = -1;
    this.textInputValue = '';

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
    this.ctx.filter = `brightness(${this.brightness}%)`;
    this.ctx.drawImage(rotated, 0, 0);
    this.ctx.filter = 'none';

    this.imageUrl = canvas.toDataURL();
    this.img.src = this.imageUrl;

    this.drawnShapes = [];
    this.cropSelection = null;
  }

  onMouseDown(ev: MouseEvent) {
    const { x, y } = this.getXY(ev);

    if (this.currentTool === 'crop' && this.cropSelection) {
      const handle = this.getResizeHandle(x, y);
      if (handle) {
        this.isResizingCrop = true;
        this.resizeHandle = handle;
        this.resizeStartX = x;
        this.resizeStartY = y;
        this.resizeOriginalCrop = { ...this.cropSelection };
        return;
      }

      if (this.isInsideCrop(x, y)) {
        this.isDraggingCrop = true;
        this.cropDragStartX = x;
        this.cropDragStartY = y;
        this.cropStartX = this.cropSelection.x;
        this.cropStartY = this.cropSelection.y;
        return;
      }
    }

    if (this.currentTool === 'text') {

      const textIndex = this.getTextAtPoint(x, y);

      if (textIndex !== -1) {
        this.selectedTextIndex = textIndex;

        // check resize first
        const handle = this.getTextResizeHandle(x, y, textIndex);
        if (handle) {
          this.isResizingText = true;
          this.textResizeHandle = handle;
          this.resizeStartX = x;
          this.resizeStartY = y;

          const shape = this.drawnShapes[textIndex];
          this.resizeOriginalCrop = {
            x: shape.points[0].x,
            y: shape.points[0].y,
            width: shape.points[1].x - shape.points[0].x,
            height: shape.points[1].y - shape.points[0].y
          };
          return;
        }

        // otherwise drag
        this.isDraggingText = true;
        this.textDragStartX = x;
        this.textDragStartY = y;
        return;
      }

      this.selectedTextIndex = -1;
    }


    const shapeIndex = this.getShapeAtPoint(x, y);
    if (shapeIndex !== -1 && this.currentTool !== 'crop' && this.currentTool !== 'text') {
      const s = this.drawnShapes[shapeIndex];

      this.isDraggingShape = true;
      this.draggedShapeIndex = shapeIndex;

      this.shapeStartX = s.points[0].x;
      this.shapeStartY = s.points[0].y;
      this.shapeStartX2 = s.points[1].x;
      this.shapeStartY2 = s.points[1].y;

      this.dragShapeStartX = x;
      this.dragShapeStartY = y;
      return;
    }

    this.isDrawing = true;
    this.startX = x;
    this.startY = y;

    if (this.currentTool === 'draw') {
      this.currentPath = [{ x, y }];
    }

    if (this.currentTool === 'crop') {
      this.cropSelection = { x, y, width: 0, height: 0 };
    }
  }

  onMouseMove(ev: MouseEvent) {
    const { x, y } = this.getXY(ev);
    // PowerPoint drag text
    if (this.isDraggingText && this.selectedTextIndex !== -1) {

      const dx = x - this.textDragStartX;
      const dy = y - this.textDragStartY;

      const s = this.drawnShapes[this.selectedTextIndex];
      s.points[0].x += dx;
      s.points[0].y += dy;
      s.points[1].x += dx;
      s.points[1].y += dy;

      this.textDragStartX = x;
      this.textDragStartY = y;

      this.redrawBase();
      this.redrawShapes();
      return;
    }

    if (this.currentTool === 'crop' && this.cropSelection && !this.isDrawing && !this.isResizingCrop && !this.isDraggingCrop) {
      this.updateCursor(x, y);
    }

    if (this.currentTool === 'text' && this.selectedTextIndex !== -1 && !this.isDrawing && !this.isResizingText) {
      this.updateTextCursor(x, y);
    }

    if (!this.isDrawing && !this.isDraggingShape && !this.isDraggingCrop && !this.isResizingCrop && !this.isResizingText) return;

    this.lastX = x;
    this.lastY = y;

    if (this.isResizingText && this.selectedTextIndex !== -1 && this.resizeOriginalCrop) {
      const dx = x - this.resizeStartX;
      const dy = y - this.resizeStartY;
      const original = this.resizeOriginalCrop;
      const shape = this.drawnShapes[this.selectedTextIndex];

      let newX = original.x;
      let newY = original.y;
      let newWidth = original.width;
      let newHeight = original.height;

      switch (this.textResizeHandle) {
        case 'nw':
          newX = original.x + dx;
          newY = original.y + dy;
          newWidth = original.width - dx;
          newHeight = original.height - dy;
          break;
        case 'ne':
          newY = original.y + dy;
          newWidth = original.width + dx;
          newHeight = original.height - dy;
          break;
        case 'sw':
          newX = original.x + dx;
          newWidth = original.width - dx;
          newHeight = original.height + dy;
          break;
        case 'se':
          newWidth = original.width + dx;
          newHeight = original.height + dy;
          break;
        case 'n':
          newY = original.y + dy;
          newHeight = original.height - dy;
          break;
        case 's':
          newHeight = original.height + dy;
          break;
        case 'e':
          newWidth = original.width + dx;
          break;
        case 'w':
          newX = original.x + dx;
          newWidth = original.width - dx;
          break;
      }

      if (newWidth < 50) {
        if (this.textResizeHandle?.includes('w')) {
          newX = original.x + original.width - 50;
        }
        newWidth = 50;
      }
      if (newHeight < 30) {
        if (this.textResizeHandle?.includes('n')) {
          newY = original.y + original.height - 30;
        }
        newHeight = 30;
      }

      shape.points[0] = { x: newX, y: newY };
      shape.points[1] = { x: newX + newWidth, y: newY + newHeight };

      this.redrawBase();
      this.redrawShapes();
      this.drawTextBoxSelection(this.selectedTextIndex);
      return;
    }

    if (this.isResizingCrop && this.cropSelection && this.resizeOriginalCrop) {
      const dx = x - this.resizeStartX;
      const dy = y - this.resizeStartY;

      const original = this.resizeOriginalCrop;
      const crop = this.cropSelection;

      switch (this.resizeHandle) {
        case 'nw':
          crop.x = original.x + dx;
          crop.y = original.y + dy;
          crop.width = original.width - dx;
          crop.height = original.height - dy;
          break;
        case 'ne':
          crop.y = original.y + dy;
          crop.width = original.width + dx;
          crop.height = original.height - dy;
          break;
        case 'sw':
          crop.x = original.x + dx;
          crop.width = original.width - dx;
          crop.height = original.height + dy;
          break;
        case 'se':
          crop.width = original.width + dx;
          crop.height = original.height + dy;
          break;
        case 'n':
          crop.y = original.y + dy;
          crop.height = original.height - dy;
          break;
        case 's':
          crop.height = original.height + dy;
          break;
        case 'e':
          crop.width = original.width + dx;
          break;
        case 'w':
          crop.x = original.x + dx;
          crop.width = original.width - dx;
          break;
      }

      if (crop.width < 20) {
        if (this.resizeHandle?.includes('w')) {
          crop.x = original.x + original.width - 20;
        }
        crop.width = 20;
      }
      if (crop.height < 20) {
        if (this.resizeHandle?.includes('n')) {
          crop.y = original.y + original.height - 20;
        }
        crop.height = 20;
      }

      this.redrawBase();
      this.drawCropOverlay();
      this.redrawShapes();
      return;
    }

    if (this.isDraggingCrop && this.cropSelection) {
      const dx = x - this.cropDragStartX;
      const dy = y - this.cropDragStartY;

      this.cropSelection.x = this.cropStartX + dx;
      this.cropSelection.y = this.cropStartY + dy;

      this.redrawBase();
      this.drawCropOverlay();
      this.redrawShapes();
      return;
    }

    if (this.isDraggingShape) {
      const dx = x - this.dragShapeStartX;
      const dy = y - this.dragShapeStartY;

      const s = this.drawnShapes[this.draggedShapeIndex];
      s.points[0].x = this.shapeStartX + dx;
      s.points[0].y = this.shapeStartY + dy;
      s.points[1].x = this.shapeStartX2 + dx;
      s.points[1].y = this.shapeStartY2 + dy;

      this.redrawBase();
      this.redrawShapes();
      return;
    }

    this.redrawBase();

    if (this.currentTool === 'draw') {
      this.currentPath.push({ x, y });
      this.drawPath(this.currentPath);
    }

    if (this.currentTool === 'rectangle' || this.currentTool === 'dottedRectangle') {
      this.drawRect(this.startX, this.startY, x, y);
    }

    if (this.currentTool === 'circle' || this.currentTool === 'dottedCircle') {
      this.drawCircle(this.startX, this.startY, x, y);
    }

    if (this.currentTool === 'text') {
      this.ctx.strokeStyle = this.drawColor;
      this.ctx.lineWidth = 2;
      this.ctx.setLineDash([5, 5]);
      this.ctx.strokeRect(this.startX, this.startY, x - this.startX, y - this.startY);
      this.ctx.setLineDash([]);
    }

    if (this.currentTool === 'crop' && this.cropSelection) {
      this.cropSelection.width = x - this.startX;
      this.cropSelection.height = y - this.startY;
      this.drawCropOverlay();
    }

    this.redrawShapes();
  }

  onMouseUp() {
    if (this.isDraggingText) {
      this.isDraggingText = false;
      return;
    }

    if (this.isResizingText) {
      this.isResizingText = false;
      this.textResizeHandle = null;
      this.resizeOriginalCrop = null;
      return;
    }

    if (this.isResizingCrop) {
      this.isResizingCrop = false;
      this.resizeHandle = null;
      this.resizeOriginalCrop = null;
      return;
    }

    if (this.isDraggingCrop) {
      this.isDraggingCrop = false;
      return;
    }

    if (this.isDraggingShape) {
      this.isDraggingShape = false;
      return;
    }

    if (!this.isDrawing) return;

    if (this.currentTool !== 'crop' && this.currentTool !== 'text') {
      this.saveShape();
    }

    if (this.currentTool === 'text' && Math.abs(this.lastX - this.startX) > 50 && Math.abs(this.lastY - this.startY) > 30) {
      const newIndex = this.drawnShapes.length;
      this.drawnShapes.push({
        type: 'text',
        points: [
          { x: Math.min(this.startX, this.lastX), y: Math.min(this.startY, this.lastY) },
          { x: Math.max(this.startX, this.lastX), y: Math.max(this.startY, this.lastY) }
        ],
        color: this.drawColor,
        width: this.lineWidth,
        text: '',
        fontSize: this.fontSize,
        fontFamily: this.fontFamily,
        fontWeight: this.fontWeight
      });

      this.startEditingText(newIndex);
    }

    this.isDrawing = false;
  }

  startEditingText(index: number) {
    this.isEditingText = true;
    this.editingTextIndex = index;
    this.selectedTextIndex = index;
    const shape = this.drawnShapes[index];
    this.textInputValue = shape.text || '';

    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    const scaleX = rect.width / this.canvasRef.nativeElement.width;
    const scaleY = rect.height / this.canvasRef.nativeElement.height;

    this.textInputPosition = {
      x: shape.points[0].x * scaleX,
      y: shape.points[0].y * scaleY,
      width: (shape.points[1].x - shape.points[0].x) * scaleX,
      height: (shape.points[1].y - shape.points[0].y) * scaleY
    };

    setTimeout(() => {
      if (this.textInputRef) {
        this.textInputRef.nativeElement.focus();
        this.textInputRef.nativeElement.select();
      }
    }, 10);

    this.redrawBase();
    this.redrawShapes();
  }

  finishTextEditing() {
    if (this.isEditingText && this.editingTextIndex !== -1) {
      this.drawnShapes[this.editingTextIndex].text = this.textInputValue;

      if (!this.textInputValue.trim()) {
        this.drawnShapes.splice(this.editingTextIndex, 1);
        this.selectedTextIndex = -1;
      }
    }

    this.isEditingText = false;
    this.editingTextIndex = -1;
    this.textInputValue = '';

    this.redrawBase();
    this.redrawShapes();
    if (this.selectedTextIndex !== -1) {
      this.drawTextBoxSelection(this.selectedTextIndex);
    }
  }

  onTextInputChange() {
    if (this.editingTextIndex !== -1) {
      this.drawnShapes[this.editingTextIndex].text = this.textInputValue;
    }
  }

  onTextInputBlur() {
    this.finishTextEditing();
  }

  onTextInputKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      this.finishTextEditing();
      event.preventDefault();
    }
  }

  deleteTextBox(index: number) {
    if (index >= 0 && index < this.drawnShapes.length) {
      this.drawnShapes.splice(index, 1);
      this.selectedTextIndex = -1;
      this.redrawBase();
      this.redrawShapes();
    }
  }

  redrawBase() {
    const c = this.canvasRef.nativeElement;
    this.ctx.clearRect(0, 0, c.width, c.height);

    this.ctx.filter = `brightness(${this.brightness}%)`;
    this.ctx.drawImage(this.img, 0, 0);
    this.ctx.filter = 'none';
  }

  drawPath(pts: any[]) {
    this.ctx.beginPath();
    this.ctx.moveTo(pts[0].x, pts[0].y);
    pts.forEach(p => this.ctx.lineTo(p.x, p.y));
    this.ctx.stroke();
  }

  drawRect(x1: number, y1: number, x2: number, y2: number) {
    this.ctx.strokeStyle = this.drawColor;
    this.ctx.lineWidth = this.lineWidth;
    this.ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
  }

  drawCircle(x1: number, y1: number, x2: number, y2: number) {
    const r = Math.hypot(x2 - x1, y2 - y1);
    this.ctx.beginPath();
    this.ctx.arc(x1, y1, r, 0, Math.PI * 2);
    this.ctx.stroke();
  }

  drawText(shape: Shape) {
    if (!shape.text || shape.text.trim() === '') return;

    const x1 = shape.points[0].x;
    const y1 = shape.points[0].y;
    const x2 = shape.points[1].x;
    const y2 = shape.points[1].y;

    const width = Math.abs(x2 - x1);
    const height = Math.abs(y2 - y1);

    this.ctx.fillStyle = shape.color;
    this.ctx.font = `${shape.fontWeight || 'normal'} ${shape.fontSize || 24}px ${shape.fontFamily || 'Arial'}`;
    this.ctx.textAlign = 'left';
    this.ctx.textBaseline = 'top';

    const padding = 8;
    const maxWidth = width - (padding * 2);
    const lineHeight = (shape.fontSize || 24) * 1.2;

    const words = shape.text.split(' ');
    const lines: string[] = [];
    let currentLine = words[0] || '';

    for (let i = 1; i < words.length; i++) {
      const testLine = currentLine + ' ' + words[i];
      const metrics = this.ctx.measureText(testLine);

      if (metrics.width > maxWidth && currentLine.length > 0) {
        lines.push(currentLine);
        currentLine = words[i];
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) {
      lines.push(currentLine);
    }

    const startY = Math.min(y1, y2) + padding;
    const startX = Math.min(x1, x2) + padding;

    lines.forEach((line, index) => {
      this.ctx.fillText(line, startX, startY + (index * lineHeight));
    });
  }

  drawTextBoxSelection(index: number) {
    if (index < 0 || index >= this.drawnShapes.length) return;

    const shape = this.drawnShapes[index];
    if (shape.type !== 'text') return;

    const x1 = shape.points[0].x;
    const y1 = shape.points[0].y;
    const x2 = shape.points[1].x;
    const y2 = shape.points[1].y;

    this.ctx.strokeStyle = '#0078d4';
    this.ctx.lineWidth = 2;
    this.ctx.setLineDash([]);
    this.ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);

    const handleSize = 8;
    this.ctx.fillStyle = '#ffffff';
    this.ctx.strokeStyle = '#0078d4';
    this.ctx.lineWidth = 2;

    const handles = [
      { x: x1, y: y1 },
      { x: x2, y: y1 },
      { x: x1, y: y2 },
      { x: x2, y: y2 },
      { x: (x1 + x2) / 2, y: y1 },
      { x: (x1 + x2) / 2, y: y2 },
      { x: x2, y: (y1 + y2) / 2 },
      { x: x1, y: (y1 + y2) / 2 }
    ];

    handles.forEach(handle => {
      this.ctx.fillRect(
        handle.x - handleSize / 2,
        handle.y - handleSize / 2,
        handleSize,
        handleSize
      );
      this.ctx.strokeRect(
        handle.x - handleSize / 2,
        handle.y - handleSize / 2,
        handleSize,
        handleSize
      );
    });
  }

  getTextResizeHandle(x: number, y: number, textIndex: number): ResizeHandle {
    if (textIndex < 0 || textIndex >= this.drawnShapes.length) return null;

    const shape = this.drawnShapes[textIndex];
    if (shape.type !== 'text') return null;

    const x1 = shape.points[0].x;
    const y1 = shape.points[0].y;
    const x2 = shape.points[1].x;
    const y2 = shape.points[1].y;
    const tolerance = 10;

    const handles: { type: ResizeHandle; x: number; y: number }[] = [
      { type: 'nw', x: x1, y: y1 },
      { type: 'ne', x: x2, y: y1 },
      { type: 'sw', x: x1, y: y2 },
      { type: 'se', x: x2, y: y2 },
      { type: 'n', x: (x1 + x2) / 2, y: y1 },
      { type: 's', x: (x1 + x2) / 2, y: y2 },
      { type: 'e', x: x2, y: (y1 + y2) / 2 },
      { type: 'w', x: x1, y: (y1 + y2) / 2 }
    ];

    for (const handle of handles) {
      if (Math.abs(x - handle.x) <= tolerance && Math.abs(y - handle.y) <= tolerance) {
        return handle.type;
      }
    }

    return null;
  }

  updateTextCursor(x: number, y: number) {
    const canvas = this.canvasRef.nativeElement;

    if (this.selectedTextIndex !== -1) {
      const handle = this.getTextResizeHandle(x, y, this.selectedTextIndex);
      if (handle) {
        const cursors: Record<string, string> = {
          'nw': 'nw-resize',
          'ne': 'ne-resize',
          'sw': 'sw-resize',
          'se': 'se-resize',
          'n': 'n-resize',
          's': 's-resize',
          'e': 'e-resize',
          'w': 'w-resize'
        };
        canvas.style.cursor = cursors[handle];
        return;
      }

      const shape = this.drawnShapes[this.selectedTextIndex];
      const x1 = shape.points[0].x;
      const y1 = shape.points[0].y;
      const x2 = shape.points[1].x;
      const y2 = shape.points[1].y;

      if (x >= x1 && x <= x2 && y >= y1 && y <= y2) {
        canvas.style.cursor = 'text';
        return;
      }
    }

    canvas.style.cursor = 'crosshair';
  }

  drawCropOverlay() {
    if (!this.cropSelection) return;

    const { x, y, width, height } = this.cropSelection;
    const c = this.canvasRef.nativeElement;

    this.ctx.setLineDash([6, 6]);
    this.ctx.strokeStyle = '#1e90ff';
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(x, y, width, height);
    this.ctx.setLineDash([]);

    this.ctx.fillStyle = 'rgba(0,0,0,0.45)';
    this.ctx.fillRect(0, 0, c.width, y);
    this.ctx.fillRect(0, y + height, c.width, c.height);
    this.ctx.fillRect(0, y, x, height);
    this.ctx.fillRect(x + width, y, c.width, height);

    this.drawResizeHandles();
  }

  drawResizeHandles() {
    if (!this.cropSelection) return;

    const { x, y, width, height } = this.cropSelection;
    const handleSize = 10;

    this.ctx.fillStyle = '#1e90ff';
    this.ctx.strokeStyle = '#ffffff';
    this.ctx.lineWidth = 2;

    const handles = [
      { x: x, y: y },
      { x: x + width, y: y },
      { x: x, y: y + height },
      { x: x + width, y: y + height },
      { x: x + width / 2, y: y },
      { x: x + width / 2, y: y + height },
      { x: x + width, y: y + height / 2 },
      { x: x, y: y + height / 2 }
    ];

    handles.forEach(handle => {
      this.ctx.fillRect(
        handle.x - handleSize / 2,
        handle.y - handleSize / 2,
        handleSize,
        handleSize
      );
      this.ctx.strokeRect(
        handle.x - handleSize / 2,
        handle.y - handleSize / 2,
        handleSize,
        handleSize
      );
    });
  }

  getResizeHandle(x: number, y: number): ResizeHandle {
    if (!this.cropSelection) return null;

    const { x: cx, y: cy, width, height } = this.cropSelection;
    const tolerance = 10;

    const handles: { type: ResizeHandle; x: number; y: number }[] = [
      { type: 'nw', x: cx, y: cy },
      { type: 'ne', x: cx + width, y: cy },
      { type: 'sw', x: cx, y: cy + height },
      { type: 'se', x: cx + width, y: cy + height },
      { type: 'n', x: cx + width / 2, y: cy },
      { type: 's', x: cx + width / 2, y: cy + height },
      { type: 'e', x: cx + width, y: cy + height / 2 },
      { type: 'w', x: cx, y: cy + height / 2 }
    ];

    for (const handle of handles) {
      if (Math.abs(x - handle.x) <= tolerance && Math.abs(y - handle.y) <= tolerance) {
        return handle.type;
      }
    }

    return null;
  }

  updateCursor(x: number, y: number) {
    const canvas = this.canvasRef.nativeElement;
    const handle = this.getResizeHandle(x, y);

    if (handle) {
      const cursors: Record<string, string> = {
        'nw': 'nw-resize',
        'ne': 'ne-resize',
        'sw': 'sw-resize',
        'se': 'se-resize',
        'n': 'n-resize',
        's': 's-resize',
        'e': 'e-resize',
        'w': 'w-resize'
      };
      canvas.style.cursor = cursors[handle];
    } else if (this.isInsideCrop(x, y)) {
      canvas.style.cursor = 'move';
    } else {
      canvas.style.cursor = 'crosshair';
    }
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
        { x: this.lastX, y: this.lastY }
      ],
      color: this.drawColor,
      width: this.lineWidth
    });
  }

  redrawShapes() {
    for (let i = 0; i < this.drawnShapes.length; i++) {
      const s = this.drawnShapes[i];

      if (s.type === 'text') {
        if (i !== this.editingTextIndex) {
          this.drawText(s);
        }
        if (i === this.selectedTextIndex && !this.isEditingText) {
          this.drawTextBoxSelection(i);
        }
        continue;
      }

      this.ctx.strokeStyle = s.color;
      this.ctx.lineWidth = s.width;

      if (s.type === 'draw') this.drawPath(s.points);

      if (s.type === 'rectangle' || s.type === 'dottedRectangle') {
        this.drawRect(s.points[0].x, s.points[0].y, s.points[1].x, s.points[1].y);
      }

      if (s.type === 'circle' || s.type === 'dottedCircle') {
        this.drawCircle(s.points[0].x, s.points[0].y, s.points[1].x, s.points[1].y);
      }
    }
  }

  getShapeAtPoint(x: number, y: number) {
    for (let i = this.drawnShapes.length - 1; i >= 0; i--) {
      const s = this.drawnShapes[i];

      if (s.type === 'rectangle' || s.type === 'dottedRectangle') {
        if (
          x >= Math.min(s.points[0].x, s.points[1].x) &&
          x <= Math.max(s.points[0].x, s.points[1].x) &&
          y >= Math.min(s.points[0].y, s.points[1].y) &&
          y <= Math.max(s.points[0].y, s.points[1].y)
        ) return i;
      }

      if (s.type === 'circle' || s.type === 'dottedCircle') {
        if (this.isInsideCircle(x, y, s.points[0], s.points[1])) return i;
      }
    }
    return -1;
  }

  getTextAtPoint(x: number, y: number): number {
    for (let i = this.drawnShapes.length - 1; i >= 0; i--) {
      const s = this.drawnShapes[i];

      if (s.type === 'text') {
        if (
          x >= Math.min(s.points[0].x, s.points[1].x) &&
          x <= Math.max(s.points[0].x, s.points[1].x) &&
          y >= Math.min(s.points[0].y, s.points[1].y) &&
          y <= Math.max(s.points[0].y, s.points[1].y)
        ) return i;
      }
    }
    return -1;
  }

  isInsideCircle(
    x: number,
    y: number,
    center: { x: number; y: number },
    edge: { x: number; y: number }
  ) {
    const r = Math.hypot(edge.x - center.x, edge.y - center.y);
    const d = Math.hypot(x - center.x, y - center.y);
    return d <= r;
  }

  isInsideCrop(x: number, y: number) {
    return !!this.cropSelection &&
      x >= this.cropSelection.x &&
      x <= this.cropSelection.x + this.cropSelection.width &&
      y >= this.cropSelection.y &&
      y <= this.cropSelection.y + this.cropSelection.height;
  }

  getXY(ev: MouseEvent) {
    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    return {
      x: (ev.clientX - rect.left) * (this.canvasRef.nativeElement.width / rect.width),
      y: (ev.clientY - rect.top) * (this.canvasRef.nativeElement.height / rect.height)
    };
  }

  applyCrop() {
    if (!this.cropSelection) return;

    const { x, y, width, height } = this.cropSelection;

    const data = this.ctx.getImageData(
      Math.min(x, x + width),
      Math.min(y, y + height),
      Math.abs(width),
      Math.abs(height)
    );

    const c = this.canvasRef.nativeElement;
    c.width = Math.abs(width);
    c.height = Math.abs(height);

    this.ctx.putImageData(data, 0, 0);

    this.ctx.filter = `brightness(${this.brightness}%)`;
    this.ctx.drawImage(c, 0, 0);
    this.ctx.filter = 'none';

    this.imageUrl = c.toDataURL();
    this.img.src = this.imageUrl;

    this.cropSelection = null;
    this.drawnShapes = [];
  }

  save() {
    if (this.isEditingText) {
      this.finishTextEditing();
    }

    this.selectedTextIndex = -1;
    this.redrawBase();
    this.redrawShapes();

    this.saved.emit({
      url: this.canvasRef.nativeElement.toDataURL(),
      caption: this.caption,
      enlarged: this.enlarged
    });
  }
  // PowerPoint style drag
  isDraggingText = false;
  textDragStartX = 0;
  textDragStartY = 0;
  onDoubleClick(ev: MouseEvent) {
    const { x, y } = this.getXY(ev);
    const index = this.getTextAtPoint(x, y);
    if (index !== -1) {
      this.startEditingText(index);
    }
  }

}
