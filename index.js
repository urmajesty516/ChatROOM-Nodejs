var express=require('express');
var path = require('path');
var app=express();
var http=require('http').Server(app);
var io=require("socket.io")(http);
var users={};
var fs=require('fs');



const port = process.env.PORT || 3000;

//The app.get() method specifies a callback function that will be invoked 
//whenever there is an HTTP GET request with a path ('/') relative to the site root.
app.get('/',function(req,res){
	res.sendFile(__dirname+"/index.html");
});

//This specifies the root directory from which to serve static assets 
app.use(express.static(path.join(__dirname, '/public')));

io.on('connection',function(socket){
	var nickname="";
	
	//new user message
	socket.on('new_users',function(new_name){
		nickname=new_name;
		//if user already exists
		if(users[nickname]){
			//only sent error msg to user himselft 
			socket.emit('username_exist','Sorry, the name is already taken. Please type again.');
			return;
		}
		users[nickname]=socket;
		io.emit('chat', 'New user '+nickname+' has joined in.');
		
		//update users online list, add the new user
		socket.on('users_online',function(msg){
			var list=[];
			if(!msg){
				for(var i in users){
					if(i!=nickname){				
						list.push(i);
						//send the others his username
						users[i].emit('users_online',nickname);		
					}				
				}
				//when a new user joined in, send him all the existing online users
				socket.emit('users_online', list);
				list=[];				
			}
		});		
	});
	
	socket.on('disconnect',function(){
		var nickname=findKey(users,socket);
		delete users[nickname];
		if(nickname){
			//broadcast: {user} left the room
			io.emit('chat','User '+nickname+' has left the room.');
			//update user online list, remove the left user
			io.emit('users_online_delete',nickname);
		}	
	});		
	
	//Don’t send the same message to the user that sent it himself
	socket.on('chat',function(msg){
		var nickname=findKey(users,socket);
		for(var i in users){
			if(users[i]!=socket){
				users[i].emit('chat', nickname+": "+msg);
			}		
		}
	});
	
	//{user} typing event
	socket.on('user_typing',function(msg){
		var nickname=findKey(users,socket);
		//if user is typing
		if(msg){
			//avoid user {false} typing message
			if(nickname){
				for(var i in users){
					if(users[i]!=socket){
						users[i].emit('user_typing', "["+i+"]User "+nickname+" is typing.");
					}		
				}				
			}	
		//if user is off typing	
		}else{
			for(var i in users){
				if(users[i]!=socket){
					users[i].emit('user_typing_off', i);
				}		
			}			
		}
	});
	
	//private messaging
	socket.on('pm',function(msg){
		for(var i in users){
			if(i==msg['To']){
				users[i].emit('pm',msg['From']+'|'+msg['message']);
			}
		}
	});
	
	//uploading
	socket.on('startUpload',function(){
		for(var i in users){
			if(users[i]!=socket){
				users[i].emit('startUpload',nickname+': <div id="lds-spinner-'+nickname+'" class="lds-spinner"><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div></div>');
			}
		}
	});
	var fileData=[];
	var slice=0;
	var dir=__dirname+'/public/files/';
	socket.on('uploading',function(file){	
		fileData.push(file['data']);
		slice++;
		/*If all the data is collected*/
		if(slice*100000>=file['size']){
			/*Join the chrunks of arrayBuffers*/
			var fileBuffer = Buffer.concat(fileData); 
			/*Convert arrayBuffer to Buffer*/
			var buffer=toBuffer(fileBuffer);
			var path=dir+file['name'];
			/*Open the directory, write the file to /public/files */
			fs.open(path,'w',function(err,fd){
				if(err){
					 throw 'could not open file: ' + err;
				}
				/* Write the file */
				fs.write(fd, buffer, 0, buffer.length, null, function(err){
					if (err) throw 'error writing file: ' + err;
					fs.close(fd, function() {
						console.log('wrote the file successfully');
					});
				});				
			});
			for(var i in users){
				if(users[i]!=socket){
					users[i].emit('uploadDone', {'user': file['user'], 'fileName': file['name']});
				}
			}	
			fileData=[];	
			slice=0;
		}else{
			//request more data of the file is being uploaded
			socket.emit('requestSlice', slice);			
		}
	});
});

http.listen(port,function(){
	console.log('Listening on port 3000');
});

//find the key in a object array matched with value
function findKey(array,value){
	for(var key in array){
		if(array[key]==value){
			return key;
		}
	}
	return false;
}

/*Convert arrayBuffer to Buffer*/
function toBuffer(ab) {
    var buffer = new Buffer(ab.byteLength);
    var view = new Uint8Array(ab);
    for (var i = 0; i < buffer.length; ++i) {
        buffer[i] = view[i];
    }
    return buffer;
}
