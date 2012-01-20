// Logic for the interaction design of a file-upload dialog.
// If you are brave enough, and provide your own upload logic,
// than this code can probably be used for a real implementation - 
// but you probably want to read through it first.
//
// Works with recent Chrome & Firefox, works with Safari but we
// can't do thumbnails since there's no FileReader. Doesn't work 
// with IE < 10. 
//
// - James (jaimzo@gmail.com)


// Make a dummy debug console if we don't have one
if (!window.console) {
  window.console = { log : function(m) {}, error: function(m) {} };
}


// Put everything in a namespace called 'J'
if (typeof(J) === 'undefined') {
  J = {};
  J.Utils = {};
}

// Set the inner html of a collection of elements (the collection
// will usually come from 'getElementsByClassName' or similar)
J.Utils.SetInnerHtml = function(elCollection, newHtml) {
  var l = elCollection.length;

  for (var ctr = 0; ctr < l; ++ctr) {
    elCollection[ctr].innerHTML = newHtml;
  }
};


// Add an event listener to every element in the given collection.
// elCollection -> a collection of elements to add a listener to
//        event -> the name of an event as a string (e.g. "dragenter")
//     listener -> the event handler function
J.Utils.AddEventListener = function(elCollection, event, listener)
{
  var l = elCollection.length;
  
  for (var ctr = 0; ctr < l; ++ctr) {
    if (elCollection[ctr].addEventListener)
      elCollection[ctr].addEventListener(event, listener);
    else
      console.warn(elCollection[ctr] + " doesn't have addEventListener");
  }
};


// Print a warning to the console and any element with class 'j-warning'
// message -> the warning message
// auxHandler (optional) -> a bespoke warning function to call with 
// 'message' as the parameter,
/*J.Warn = function(message, auxHandler) {
  console.warn(message);
  
  if (auxHandler && typeof(auxHandler) === 'function')
    auxHandler(message);
}*/



// Create a progress bar UI widget given a reference to the top level
// DOM element of the widget's UI representation.
//
// 'topEl' should contain at least one element with the class 'fc-progress-fill'
// that will provide the progress measure (it will have its width set to the
// percentage corresponding to the elapsed progress)
// 
// 'topEl' may also contain zero or more elements with the class 'fc-label' that
// will have their innerText set to messages that may be provided by the consumer 
// of the widget.
//
// This returns an object containing two functions:
//  SetProgress: Set the progress to be represented by this widget as a percentage
//               e.g. SetProgress( 25 )
//  SetLabel: Set the label text to display. E.g. SetLabel('Almost there...')
//
// If you provide a null or invalid topEl, or your browser cannot support the
// widget, this function will return null.
J.CreateProgressBar = function(topEl) {
  if (topEl === null) {
    console.warn("Need a  reference to a DOM element to create progress bar");
    return null;
  }
  
  if (topEl.getElementsByClassName === undefined) {
    console.warn('Progress bar does not work on older browsers yet');
    return null;
  }
    

  var _component = topEl;
  var _label = _component.getElementsByClassName('fc-label');
  var _progressIndicator = _component.getElementsByClassName('fc-progress-indicator');
  var _progressFill = _component.getElementsByClassName('fc-progress-fill');
  var _progressFillCount = _progressFill.length;
  var _labelCount = _label.length;

  var _progress = 0;

  return {
    SetProgress : function(amount) {
      for (var ctr = 0; ctr < _progressFillCount; ++ctr) {
        _progressFill[ctr].style.width = amount+'%';
      }
    },
    
    SetLabel : function(labelText) {
      for (var ctr = 0; ctr < _labelCount; ++ctr) {
        _label[ctr].innerText = labelText;
      }
    }
  };
};


// Create a file uploader widget given the DOM node of its top-level element.
J.CreateFileUploader = function(topEl) {
  if (typeof(topEl) === 'undefined' || topEl === null) {
    // TODO: Dumb to restrict this to a div - get rid of the constructor check?
    console.warn("File upload top element is either null or the wrong type - should be a div");
    return null;
  }

  var _haveClassList = (topEl.classList !== undefined);
  var _haveFindByClass = (document.getElementsByClassName !== undefined);

  // Call the top level element 'dialog' for want of a better name
  var _dialog = topEl;

  // Panels that are interested in error messages
  var _errorPanels = [];
  var _errorVisible = false;
  var _errorMessages = [];

  if (_haveClassList) {
    _errorPanels = topEl.getElementsByClassName('fc-error-message');
  }

  // Show a warning message...
  var _warn = function(message) {
    if (_errorPanels.length > 0) {
      for (var ctr = 0; ctr < _errorPanels.length; ++ctr) {
        _errorPanels[ctr].textContent = message;
      }

      if (_haveClassList) {
        if (_dialog.classList.contains('fc-errored') === false)
          _dialog.classList.add('fc-errored');
      }
    }

    _errorMessages.push(message);

    console.warn(message);
  };


  // Remove a warning message...
  var _clearWarning = function() {
    if (_errorMessages.length > 0) {
      _errorMessages.pop();
      if (_errorMessages.length > 0) {
        if (_errorPanels.length > 0) {
          for (var c = 0; c < _errorPanels.length; ++c)
            _errorPanels[c].innerText = messages[0];
        } 
      } else {
        if (_haveClassList)
          _dialog.classList.remove('fc-errored');
      }
    }
  }

  if (!_haveFindByClass) {
    _warn('Uploader does not work on older browsers - try the latest Chrome or Firefox');
    return;
  }

  

  // The panel that displays the instructions for using the dialog
  // this can block a drag-drop operation unless we apply drag/drop
  // event handlers to it
  var _instructions = topEl.getElementsByClassName('fc-instructions');

  // The count of all the files added to the dialog
  var _count = 0;

  // Displays _count
  var _countEl = topEl.getElementsByClassName('fc-count');

  // Displays 's' if we have anything other than 1 picture in the dialog. I.e multiple
  // picture*s*
  var _countSfx = topEl.getElementsByClassName('fc-count-sfx');

  // Controls that show the file chooser...
  var _findPictureTrigger = topEl.getElementsByClassName('fc-show-chooser');

  // The file chooser
  var _fileInput = topEl.getElementsByClassName('fc-hidden-fc');


  // The element that displays the selected images. Presumably in a grid but
  // not necessarily...
  var _picGrid = topEl.getElementsByClassName('fc-picture-grid');

  // Having only one pic grid makes adding new images slightly easier at
  // the expense of some inflexibility - should really fix this.
  if (_picGrid.length > 0)
    _picGrid = _picGrid[0];
  else
    _picGrid = null;

  
  // The panel containing the activation and upload controls
  var _ctrlsPanel = topEl.getElementsByClassName('fc-controls-panel');

  // The panel containig the send button, and the send button itself
  var _activateCtrls = topEl.getElementsByClassName('fc-activate-ctrls');
  var _sendButton = topEl.getElementsByClassName('fc-do-upload');

  // The panel containing the upload progress UI
  var _uploadingCtrls = topEl.getElementsByClassName('fc-uploading-ctrls');
  var _currentUpload = topEl.getElementsByClassName('fc-current-upload-img');
  var _currentProgressEl = topEl.getElementsByClassName('fc-current-progress');

  // Create a progress bar widget (above) for each upload progress display
  var _currentProgress = [];
  for (var ctr = 0; ctr < _currentProgressEl.length; ++ctr) {
    _currentProgress.push(J.CreateProgressBar(_currentProgressEl[ctr]))
  };


  // The local path of the current upload (actually just the filename since
  // webkit won't give us the full path
  var _sendingPath = topEl.getElementsByClassName('fc-sending-path');
  
  // A button to cancel the upload
  var _stopUploadButton = topEl.getElementsByClassName('fc_stop_upload');
  var _uploadCancelled = false;

  // A gmail'esk undo UI...
  var _undoBanner = topEl.getElementsByClassName('fc-undo-banner');
  var _undoButton = topEl.getElementsByClassName('fc-undo-remove');
  var _undoAllButton = topEl.getElementsByClassName('fc-undo-all');
  var _undoBannerVisible = false;

  // Elements that should display the number of pictures uploaded
  var _picsSentCount = topEl.getElementsByClassName('fc-pics-sent');

  // Elements that should display the number of pictures that will be uploaded
  var _picsSendingCount = topEl.getElementsByClassName('fc-pics-count');

  // Items currently selected
  var _selectedItems = [];

  // Items that have been removed
  var _removedItems = [];


  // Namespace alias
  var JU = J.Utils;





  // Change the count of images currently in the dialog
  // This will record the count and update UI associated with displaying
  // the count
  var _changeCount = function(change) {
    _count += change;
    JU.SetInnerHtml(_countEl, ''+_count);

    if (_count !== 1)
      JU.SetInnerHtml(_countSfx, 's');
    else
      JU.SetInnerHtml(_countSfx, '');

    if (_dialog.classList) {
      if (_count === 0) {
        _dialog.classList.add('fc-empty');
      } else {
        _dialog.classList.remove('fc-empty');
        if (!_dialog.classList.contains('fc-sending'))
          if (!_dialog.classList.contains('fc-collecting'))
            _dialog.classList.add('fc-collecting');
      }
    }
  };

  
  // Show a file chooser by programmatically activating the 
  // first <input type='file'> that we find
  var _activateFileChooser = function() {
    if (_fileInput.length > 0) {
      (_fileInput[0]).click();
    } 
  };


  // Clear all the current selections
  var _clearSelections = function() {
    var l = _selectedItems.length;

    for (var ctr = 0; ctr < l; ++ctr) {
      if (_selectedItems[ctr].classList) {
        _selectedItems[ctr].classList.remove('fc-selected');
      }
    }

    _selectedItems = [];
  };


  // Event callback for item clicks. This will select the item
  var _itemClick = function(e) {
    if (e.altKey === false)
      _clearSelections();

    var el = e.currentTarget;
    if (el === null)
      el = this;
 
    if (!el) {
      // I give up...
      console.warn("Can't figure out events on this browser");

      return;
    }


    if (el.classList) {
      var cl = el.classList;

      // Don't allow pending uploads to be selected; clumsy but effective.
      if (cl.contains('fc-will-upload') === false && cl.contains('fc-selected') === false) {
        cl.add('fc-selected');
      }
    }

    _selectedItems.push(el);
  };

  

  // Remove an item from the dialog. The item will be pushed onto
  // the _removedItems list so the user is able to undo the removal
  // if it was a mistake
  var _doItemRemove = function(e) {
    if (e.preventDefault)
      e.preventDefault();

    e.cancelBubble = true;

    // shoddy - climb up one level to get to the grid item...
    var removeButton = this;
    if (!this.parentNode) {
      _warn('Item structure must have changed - fix _doItemRemove');
      return;
    }
    var item = this.parentNode;


    if (item.classList) {
      if (item.classList.contains('fc-selected')) {
        var idx = _selectedItems.indexOf(item);
        if (idx !== -1) {
          item.classList.remove('fc-selected');
          _selectedItems.splice(idx, 1);
        } else {
          // err
          console.warn("could not find item that says it's selected in selected list");
        }
      } 
    }

    _picGrid.removeChild(item);
    
    _removedItems.push(item);

    
    if (!_undoBannerVisible)
    {
      for (var ctr = 0; ctr < _undoBanner.length; ++ctr)
        if (_undoBanner[ctr].classList)
          _undoBanner[ctr].classList.remove('fc-hidden');
      
      _undoBannerVisible = true;
    }

    _changeCount(-1);


    return false;
  };


  // Undo all the items removed so far
  var _undoAllRemoves = function() {
    var l = _removedItems.length;
    for (var ctr = 0; ctr < l; ++ctr) {
      _picGrid.insertBefore(_removedItems[ctr], _picGrid.firstElementChild);
    }

    _changeCount(l);

    _removedItems = [];

    for (var ctr = 0; ctr < _undoBanner.length; ++ctr) {
      if (_undoBanner[ctr].classList)
        _undoBanner[ctr].classList.add('fc-hidden');
    }

    _undoBannerVisible = false;
  };



  // Undo the most recent remove
  var _undoItemRemove = function() {
    if (_removedItems.length === 0)
      return;

    var item = _removedItems.pop();
    _picGrid.insertBefore(item, _picGrid.firstElementChild);
    
    _changeCount(1);

    if (_removedItems.length === 0) {
      if (_undoBanner.length > 0) {
        for (var ctr = 0; ctr < _undoBanner.length; ++ctr) {
          if (_undoBanner[ctr].classList)
            _undoBanner[ctr].classList.add('fc-hidden');
        }
      }
      _undoBannerVisible = false;
    }
  };



  // Create a new item in the picture grid.
  // The item is 'tentative' because we will not have loaded the thumbnail
  // for the item yet, we show an in-place progress gif while we load
  var _createTentativeItem = function(fileName) {
    if (_picGrid === null) {
      console.warn('No picture grid - cannot create item');
      _warn('Sorry, the internal structure of the uploader seems to be broken - cannot upload pictures.');
      return;
    }


    var item = document.createElement('div');
    item.className = 'fc-img-item';
    if (item.dataset !== undefined)
      item.dataset.name = fileName;

    
    var img = new Image();
    img.src = './images/bar_spinner.gif';

    var remove = document.createElement('div');
    remove.className = 'fc-remove';
    remove.appendChild(document.createTextNode('remove'));
    remove.addEventListener('click', _doItemRemove, false);
                       
    item.addEventListener('click', _itemClick, false);
    item.appendChild(img);
    item.appendChild(remove);


    _picGrid.insertBefore(item, _picGrid.firstElementChild);

    return item;
  };



  // Load the file referenced by 'file', which is a File object (that's a lot of "files")
  // 'file' must reference an image file (i.e. a file with a mime type starting with "image/")
  // and we use a FileReader to load a thumbnail of the file for display in the picture grid.
  // If FileReader is not availableon the browser we show a default graphic instead.
  var _loadFile = function(file) {
    var f = file;

    var n = file.name || 'no name';

    if (file.type !== undefined) {
      if (file.type.substr(0, 5) !== 'image') {
        _warn(n + ' is not an image file - will not add');
        return;
      }
    } else {
      // Be cautious
      _warn(n + "may not be an image (no mime type). Will not add it.")
      return;
    }
    

    var tentativeItem = _createTentativeItem(n);

    if (typeof(FileReader) !== 'undefined') {
      var reader = new FileReader();
      
      var fileLoaded = function(e) {
        var imgs = tentativeItem.getElementsByTagName('img');
        for (var ctr = 0; ctr < imgs.length; ++ctr) {
          imgs[ctr].src = e.target.result;
        }


        if (tentativeItem.classList)
          tentativeItem.classList.add('fc-need-upload');


        _changeCount(1);
      };

      if (reader.addEventListener) {
        reader.addEventListener('load', fileLoaded);
      } else {
        // chrome
        reader.onload = fileLoaded;
      }

      reader.readAsDataURL(file);
    } else {

      var imgs = tentativeItem.getElementsByTagName('img');
      for (var ctr = 0; ctr < imgs.length; ++ctr) {
        imgs[ctr].src = './images/file_upload/no_thumbnail.png';
      }


      if (tentativeItem.classList)
        tentativeItem.classList.add('fc-need-upload');


      _changeCount(1);
    }
  };


  // Called when the user choosed files via an activated <input type='file'>
  var _filesChosen = function(e) {
    e.preventDefault();

    var ipt = e.target;
    if (ipt.constructor !== HTMLInputElement) {
      console.warn('Got files chosen event from an element that is not a file input - ' + ipt.constructor);
      return;
    }


    var files = ipt.files;
    var l = files.length;
    for (var ctr = 0; ctr < l; ++ctr) {
      _loadFile(files[ctr]);
    }
  };


  // The user is dragging files over the grid - have to cancel the event default
  // to make sure drop works.
  var _dragOver = function(e) {
    if (e.preventDefault)
      e.preventDefault();
  };

  
  // The user has dragged files over the grid
  var _dragEnter = function(e) {
    if (e.preventDefault)
      e.preventDefault();
    
    if (e.target.classList)
      e.target.classList.add('fc-drag-over');

    return false;
  };


  // The user has left the grid without dropping any files
  var _dragLeave = function(e) {
    if (e.preventDefault)
      e.preventDefault();

    
    if (e.target.classList)
      e.target.classList.remove('fc-drag-over');

    return false;
  };
  

  // The user has dropped files on the grid. Load them.
  var _drop = function(e) {
    e.preventDefault();

    if (e.target.classList)
      e.target.classList.remove('fc-drag-over');
    
    var files = e.dataTransfer.files;
    var l = files.length;
    for (var ctr = 0; ctr < l; ++ctr) {
      _loadFile(files[ctr]);
    }

    return false;
  };



  // Send all the current files to wherever they are going.
  // This demo doesn't actually sendanything anywhere, but emulates the interface
  // you would see using timeouts.
  var _send = function(e) {

    // Switch mode - this will display the 'upload' UI and hide the 'collecting' UI
    if (_dialog.classList) {
      _dialog.classList.remove('fc-collecting');
      _dialog.classList.add('fc-sending');
    }


    // Transfer all the items that need uploading to a 'will upload' list and
    // adjust their classNames accordingly. This allows the user to continue
    // to drag new files onto the grid without interfering with the current
    // upload...
    var willUpload = _picGrid.getElementsByClassName('fc-will-upload');
    var needUpload = _picGrid.getElementsByClassName('fc-need-upload');
    
        while (needUpload.length > 0) {
      needUpload[0].classList.add('fc-will-upload');    // will add the item to 'willUpload'
      needUpload[0].classList.remove('fc-need-upload'); // will remove the item from 'needUpload'
    }


    toSendCount = willUpload.length;

    var sentCount = 0;

    var fakeProgress = 0;
    
    var sendCurrent = null;


    // Start the sent counter UIs at 0 (i.e. 0 files sent so far)
    for (var ctr = 0; ctr < _picsSendingCount.length; ++ctr) {
      _picsSendingCount[ctr].innerHTML = '' + toSendCount;
    }


    // Adjust the upload counter UIs to reflect the number of files that
    // will be sent
    for (var ctr = 0; ctr < _picsSentCount.length; ++ctr) {
      _picsSentCount[ctr].innerHTML = '0';
    }


    // Cancel the current upload.
    var stopSending = function() {
      _uploadCancelled = true;
      willUpload = [];
    };


    // The current file has been uploaded (or the upload was cancelled)
    var sendFinished = function() {
      _dialog.classList.remove('fc-sending')
      if (_count === 0)
        _dialog.classList.add('fc-empty');
      else
        _dialog.classList.add('fc-collecting');

      // May need to reset some items if the upload was
      // cancelled...
      var cancelledItems = _picGrid.getElementsByClassName('fc-will-upload');
      if (cancelledItems.length > 0) {
        while (cancelledItems.length > 0) {
          cancelledItems[0].classList.add('fc-need-upload');
          cancelledItems[0].classList.remove('fc-will-upload');
        }
      }
    };


    // Simulate an upload progress bar
    var updateFakeProgress = function() {
      fakeProgress += 10;

      for (var ctr = 0; ctr < _currentProgress.length; ++ctr) {
        _currentProgress[ctr].SetProgress(fakeProgress);
      }

      var fun = updateFakeProgress;

      if (fakeProgress === 100) {
        fakeProgress = 0;
        
        // This removes the image from both the grid _and_ the 
        // 'willUpload' collection
        _picGrid.removeChild(willUpload[0]);
        
        sentCount += 1;
        for (var ctr = 0; ctr < _picsSentCount.length; ++ctr) {
          _picsSentCount[ctr].innerHTML = sentCount + '';
        }
        
        fun = sendCurrent;
        
        _changeCount(-1);
      }

      if (_uploadCancelled === false) {
        setTimeout(fun, 500);
      } else {
        // reset the cancelled flag...
        _uploadCancelled = false;
        sendFinished();
        // ...and return without scheduling any more callbacks...
      }
    };


    // Upload (hypothetically) the file at the head of the upload queue
    // We simulate upload progress using timeouts in this design
    sendCurrent = function() {
      for (var ctr = 0; ctr < _currentProgress.length; ++ctr) {
        _currentProgress[ctr].SetProgress(0);
      }

      if (_uploadCancelled || willUpload.length === 0) {
        sendFinished();
        _uploadCancelled = false;
        return;
      }
   
      var current = willUpload[0];

      var name = '';
      if (current.dataset !== null)
        if (current.dataset.name !== undefined)
          name = current.dataset.name

      // Update any labels that show the current upload name
      JU.SetInnerHtml(_sendingPath, name);

      
      var img = current.getElementsByTagName('img')[0];
      var data = img.src;
      
      for (var ctr = 0; ctr < _currentUpload.length; ++ctr)
        _currentUpload[ctr].src = data;
      

      // Here's were you would do the real upload. 
      // If this browser supports 'FileReader' then 'data' 
      // holds the base64'd image data. Otherwise you're on your
      // own
      setTimeout(updateFakeProgress, 500);
    };


    sendCurrent();
  }


  // Click listener that will cancel the current send
  var _cancelSend = function() {
    _uploadCancelled = true;
  };


  // Initialisation....

  // Wire up the send listener
  if (_sendButton.length > 0) {
    JU.AddEventListener(_sendButton, 'click', _send);
  }

  // Wire up the cancel send listener
  if (_stopUploadButton.length > 0) {
    JU.AddEventListener(_stopUploadButton, 'click', _cancelSend);
  };


  // Wire up listeners to display a file dialog via <input type='file'>
  // If no file inputs are present under _dialog then all the _findPictureTrigger
  // elements will be hidden with 'display: none'
  if (_fileInput.length > 0) {
    JU.AddEventListener(_fileInput, 'change', _filesChosen);
    
    if (_findPictureTrigger.length > 0) {
      for (var ctr = 0; ctr < _findPictureTrigger.length; ++ctr) {
        _findPictureTrigger[ctr].addEventListener('click', _activateFileChooser);
      }
    }
  } else {
    // If we can't find any file inputs then hide all the triggers that are
    // meant to show it
    if (_findPictureTrigger.length > 0) {
      for (var ctr = 0; ctr < _findPictureTrigger.length; ++ctr) {
        if (_findPictureTrigger[ctr].style !== undefined)
          _findPictureTrigger[ctr].style.display = 'none';
      }
    }
  }


  if (_undoButton.length > 0) {
    JU.AddEventListener(_undoButton, 'click', _undoItemRemove);
  }


  if (_undoAllButton.length > 0) {
    JU.AddEventListener(_undoAllButton, 'click', _undoAllRemoves);
  }



  if (_picGrid !== null) {
    _picGrid.addEventListener('dragenter', _dragEnter);
    _picGrid.addEventListener('dragleave', _dragLeave);
    _picGrid.addEventListener('dragover', _dragOver);
    _picGrid.addEventListener('drop', _drop);
  }

  
  // The instruction panel can block a drag-drop unless we
  // apply the event handler to it as well
  if (_instructions.length !== 0) {
    JU.AddEventListener(_instructions, 'dragenter', _dragEnter);
    JU.AddEventListener(_instructions, 'dragleave', _dragLeave);
    JU.AddEventListener(_instructions, 'dragover', _dragOver);
    JU.AddEventListener(_instructions, 'drop', _drop);
  }


  return {
     
  };
};