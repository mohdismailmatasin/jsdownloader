## **Download Manager**

A simple command-line download manager built with Node.js that supports downloading files from direct URLs and torrent links. This tool provides visual feedback during downloads through a progress bar.

## **Features**

*   Download files from direct HTTP/HTTPS links.
*   Download files from magnet links using WebTorrent.
*   Read multiple download links from a **.txt** file.
*   Progress bar display for ongoing downloads.
*   Automatically creates a downloads directory on the desktop.

## **Requirements**

*   Node.js (version 12 or higher)
*   npm (Node Package Manager)

## **Installation**

1.  Clone this repository or download the script file.
2.  Navigate to the project directory in your terminal.
3.  Install the required packages:

```bash
npm install webtorrent
```

## **Usage**

To use the download manager, run the script with a URL or a path to a **.txt** file containing URLs. The script supports both direct download links and magnet links.

### **Command Line Usage**

```bash
node downloadManager.js <url/magnet link/.txt>
```

### **Examples**

1.  **Download a single file**
    
    ```bash
    node downloadManager.js https://example.com/file.zip
    ```
    
2.  **Download a magnet link**
    
    ```bash
    node downloadManager.js magnet:?xt=urn:btih:...
    ```
    
3.  **Download multiple files from a .txt file**
    
    Create a **downloads.txt** file with the following contents:
    
    ```bash
    https://example.com/file1.zip
    https://example.com/file2.zip
    'magnet:?xt=urn:btih:...'
    ```
    
    Then run
    
    ```bash
    node downloadManager.js downloads.txt
    ```

## **Progress Bar**

The progress bar will indicate the download status, changing colors based on the progress:

*   Red (0-49%)
*   Yellow (50-99%)
*   Green (100%)

## **Download Directory**

The downloaded files will be saved in a **downloads** directory on your desktop, which will be created automatically if it does not exist.

## **Error Handling**

If an error occurs during the download process, the script will log the error message to the console and continue downloading the next file if applicable.

## **Support**

The script uses Node.js and several native modules (https, fs, path, os), which are supported across different operating systems. Let's go over which OS this script can run on:

*   Windows (win32): The script will work fine on Windows, and the downloads will be saved in the Desktop/downloads folder by default.
*   macOS (darwin): The script will also work on macOS, saving downloads to Desktop/downloads.
*   Linux (linux): The script works similarly on Linux, saving files to Desktop/downloads.

## **License**

This project is licensed under the MIT License. See the LICENSE file for details.

## **Contributing**

Contributions are welcome! Feel free to submit a pull request or open an issue for any enhancements or bug fixes.

## **Acknowledgments**

*   WebTorrent for enabling torrent downloads.
*   Node.js for providing a powerful runtime for building this application.
